import fs from 'node:fs';
import path from 'node:path';

import * as ts from 'typescript';

import {
  HTTP_METHODS,
  OPERATIONAL_PAGE_POLICIES,
  ROUTE_ACCESS_POLICIES,
  type HttpMethod,
  type RoutePolicy,
} from '@/lib/route-access-policy';

const DAPP_ROOT = path.resolve(__dirname, '../..');
const APP_ROOT = path.join(DAPP_ROOT, 'src/app');
const MANIFEST_PATH = path.join(DAPP_ROOT, 'src/lib/route-access-policy.ts');
const ROUTE_FILE_PATTERN = /^route\.(?:ts|tsx|js|jsx)$/;
const PAGE_FILE_PATTERN = /^page\.(?:ts|tsx|js|jsx)$/;
const HTTP_METHOD_SET = new Set<string>(HTTP_METHODS);
const SENSITIVE_SERVER_IMPORT_PATTERN = /['"](?:@\/lib\/(?:prisma|indexer-db|operational-access)(?:['"/])|mongodb['"]|server-only['"])/;

type RouteInventory = {
  routes: Map<string, Set<HttpMethod>>;
  sources: Map<string, string>;
  duplicateHandlers: string[];
  duplicateRouteFiles: string[];
  routeShapeCollisions: string[];
  emptyRouteFiles: string[];
  unsupportedRouteSegments: string[];
};

function scriptKind(filePath: string) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function isExported(node: ts.Node) {
  return ts.canHaveModifiers(node)
    && Boolean(ts.getModifiers(node)?.some((modifier) => (
      modifier.kind === ts.SyntaxKind.ExportKeyword
    )));
}

function collectBindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];

  return name.elements.flatMap((element) => (
    ts.isOmittedExpression(element) ? [] : collectBindingNames(element.name)
  ));
}

function exportedHttpMethods(filePath: string) {
  const sourceFile = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const methods = new Set<HttpMethod>();
  const duplicates: HttpMethod[] = [];

  const add = (candidate: string) => {
    if (!HTTP_METHOD_SET.has(candidate)) return;
    const method = candidate as HttpMethod;
    if (methods.has(method)) duplicates.push(method);
    methods.add(method);
  };

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement)
      && isExported(statement)
      && statement.name
    ) {
      add(statement.name.text);
      continue;
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of collectBindingNames(declaration.name)) add(name);
      }
      continue;
    }

    if (
      ts.isExportDeclaration(statement)
      && statement.exportClause
      && ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) add(element.name.text);
    }
  }

  return { methods, duplicates };
}

function routeFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return routeFiles(absolutePath);
      return ROUTE_FILE_PATTERN.test(entry.name) ? [absolutePath] : [];
    });
}

function pageFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return pageFiles(absolutePath);
      return PAGE_FILE_PATTERN.test(entry.name) ? [absolutePath] : [];
    });
}

function routeDirectorySegments(filePath: string) {
  return path.relative(APP_ROOT, path.dirname(filePath)).split(path.sep).filter(Boolean);
}

function appPathForFile(filePath: string) {
  const suffix = routeDirectorySegments(filePath).join('/');
  return suffix ? `/${suffix}` : '/';
}

function pagePathForFile(filePath: string) {
  const suffix = routeDirectorySegments(filePath)
    .filter((segment) => !segment.startsWith('(') && !segment.startsWith('@'))
    .join('/');
  return suffix ? `/${suffix}` : '/';
}

function normalizedRouteShape(route: string) {
  return route
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, '[[...param]]')
    .replace(/\[\.\.\.[^\]]+\]/g, '[...param]')
    .replace(/\[[^\]]+\]/g, '[param]');
}

function discoverRouteInventory(): RouteInventory {
  const routes = new Map<string, Set<HttpMethod>>();
  const routeSources = new Map<string, string>();
  const routeShapes = new Map<string, string>();
  const duplicateHandlers: string[] = [];
  const duplicateRouteFiles: string[] = [];
  const routeShapeCollisions: string[] = [];
  const emptyRouteFiles: string[] = [];
  const unsupportedRouteSegments: string[] = [];

  for (const filePath of routeFiles(APP_ROOT)) {
    const unsupportedSegments = routeDirectorySegments(filePath)
      .filter((segment) => segment.startsWith('(') || segment.startsWith('@'));
    if (unsupportedSegments.length > 0) {
      unsupportedRouteSegments.push(
        `${path.relative(APP_ROOT, filePath)}: ${unsupportedSegments.join(', ')}`,
      );
    }

    const route = appPathForFile(filePath);
    const existingSource = routeSources.get(route);
    if (existingSource) {
      duplicateRouteFiles.push(`${route}: ${existingSource}, ${filePath}`);
      continue;
    }
    routeSources.set(route, filePath);

    const shape = normalizedRouteShape(route);
    const existingShape = routeShapes.get(shape);
    if (existingShape && existingShape !== route) {
      routeShapeCollisions.push(`${shape}: ${existingShape}, ${route}`);
    } else {
      routeShapes.set(shape, route);
    }

    const exported = exportedHttpMethods(filePath);
    if (exported.methods.size === 0) emptyRouteFiles.push(filePath);
    duplicateHandlers.push(...exported.duplicates.map((method) => `${route} ${method}`));
    routes.set(route, exported.methods);
  }

  return {
    routes,
    sources: routeSources,
    duplicateHandlers,
    duplicateRouteFiles,
    routeShapeCollisions,
    emptyRouteFiles,
    unsupportedRouteSegments,
  };
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression)
    || ts.isSatisfiesExpression(expression)
    || ts.isParenthesizedExpression(expression)
    || ts.isNonNullExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function exportedHandlerCallNames(filePath: string, method: HttpMethod) {
  const sourceFile = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  let handlerBody: ts.ConciseBody | undefined;

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement)
      && isExported(statement)
      && statement.name?.text === method
    ) {
      handlerBody = statement.body;
      break;
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== method) continue;
        if (!declaration.initializer) continue;
        const initializer = unwrapExpression(declaration.initializer);
        if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
          handlerBody = initializer.body;
        }
      }
    }
  }

  if (!handlerBody) return null;
  const callNames = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      callNames.add(node.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(handlerBody);
  return callNames;
}

function discoverSensitiveOperationalPages() {
  const pages = new Map<string, string>();
  const duplicatePages: string[] = [];

  for (const filePath of pageFiles(APP_ROOT)) {
    const source = fs.readFileSync(filePath, 'utf8');
    if (!SENSITIVE_SERVER_IMPORT_PATTERN.test(source)) continue;

    const page = pagePathForFile(filePath);
    const existingSource = pages.get(page);
    if (existingSource) {
      duplicatePages.push(`${page}: ${existingSource}, ${filePath}`);
      continue;
    }
    pages.set(page, filePath);
  }

  return { pages, duplicatePages };
}

function propertyNameText(name: ts.PropertyName) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  throw new Error(`Unsupported computed policy key: ${name.getText()}`);
}

function manifestLiteralInventory() {
  const sourceFile = ts.createSourceFile(
    MANIFEST_PATH,
    fs.readFileSync(MANIFEST_PATH, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((candidate) => (
      ts.isIdentifier(candidate.name)
      && candidate.name.text === 'ROUTE_ACCESS_POLICIES'
    ));

  if (!declaration?.initializer) throw new Error('ROUTE_ACCESS_POLICIES must have an initializer');
  const initializer = unwrapExpression(declaration.initializer);
  if (!ts.isObjectLiteralExpression(initializer)) {
    throw new Error('ROUTE_ACCESS_POLICIES must be declared as an object literal');
  }

  const routes: string[] = [];
  const duplicateRoutes: string[] = [];
  const duplicateMethods: string[] = [];
  const seenRoutes = new Set<string>();

  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error('ROUTE_ACCESS_POLICIES only accepts explicit route properties');
    }
    const route = propertyNameText(property.name);
    if (seenRoutes.has(route)) duplicateRoutes.push(route);
    seenRoutes.add(route);
    routes.push(route);

    const methodsExpression = unwrapExpression(property.initializer);
    if (!ts.isObjectLiteralExpression(methodsExpression)) {
      throw new Error(`${route} must declare its methods as an object literal`);
    }
    const seenMethods = new Set<string>();
    for (const methodProperty of methodsExpression.properties) {
      if (!ts.isPropertyAssignment(methodProperty)) {
        throw new Error(`${route} only accepts explicit method properties`);
      }
      const method = propertyNameText(methodProperty.name);
      if (seenMethods.has(method)) duplicateMethods.push(`${route} ${method}`);
      seenMethods.add(method);
    }
  }

  return { routes, duplicateRoutes, duplicateMethods };
}

function sorted(values: Iterable<string>) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

const registeredPolicies = ROUTE_ACCESS_POLICIES as Readonly<Record<string, RoutePolicy>>;

describe('route access policy inventory', () => {
  it('classifies every App Router handler and exact exported HTTP method bidirectionally', () => {
    const inventory = discoverRouteInventory();

    expect(inventory.duplicateHandlers).toEqual([]);
    expect(inventory.duplicateRouteFiles).toEqual([]);
    expect(inventory.routeShapeCollisions).toEqual([]);
    expect(inventory.emptyRouteFiles).toEqual([]);
    expect(inventory.unsupportedRouteSegments).toEqual([]);
    expect(inventory.routes.size).toBe(104);
    expect(sorted(inventory.routes.keys())).toEqual(sorted(Object.keys(registeredPolicies)));

    for (const [route, methods] of inventory.routes) {
      expect(sorted(Object.keys(registeredPolicies[route] ?? {}))).toEqual(sorted(methods));
    }
  });

  it('keeps the manifest literal free of duplicate routes and methods', () => {
    const literal = manifestLiteralInventory();

    expect(literal.duplicateRoutes).toEqual([]);
    expect(literal.duplicateMethods).toEqual([]);
    expect(sorted(literal.routes)).toEqual(sorted(Object.keys(registeredPolicies)));
  });

  it('keeps every method policy complete and fail-closed for sensitive prefixes', () => {
    const validAccess = new Set(['public', 'user', 'admin', 'internal', 'webhook']);
    const validRuntime = new Set(['all', 'local-only', 'retired']);
    const validExposure = new Set(['none', 'public', 'personal', 'operational', 'sensitive']);

    for (const [route, routePolicy] of Object.entries(registeredPolicies)) {
      expect(Object.keys(routePolicy).length).toBeGreaterThan(0);

      for (const [method, methodPolicy] of Object.entries(routePolicy)) {
        expect(HTTP_METHOD_SET.has(method)).toBe(true);
        expect(validAccess.has(methodPolicy.access)).toBe(true);
        expect(validRuntime.has(methodPolicy.runtime)).toBe(true);
        expect(validExposure.has(methodPolicy.dataExposure)).toBe(true);
        expect(typeof methodPolicy.authContract).toBe('string');
        expect(methodPolicy.authContract.length).toBeGreaterThan(0);
        expect(typeof methodPolicy.sideEffect).toBe('boolean');

        const isInternalPath = route.split('/').includes('internal');
        const isDebugPath = route.startsWith('/api/debug/');
        if (isInternalPath || isDebugPath) expect(methodPolicy.access).not.toBe('public');
        if (isDebugPath) {
          expect(methodPolicy.access).toBe('admin');
          expect(methodPolicy.runtime).toBe('local-only');
        }
        if (methodPolicy.access === 'admin') {
          expect(methodPolicy.authContract).toBe('admin-signed-wallet-allowlist');
        }
        if (methodPolicy.access === 'internal' || methodPolicy.access === 'webhook') {
          expect(methodPolicy.authContract).not.toBe('none');
        }
        if (methodPolicy.runtime === 'local-only') expect(methodPolicy.access).toBe('admin');
        if (methodPolicy.runtime === 'retired') expect(methodPolicy.authContract).toBe('retired');
      }
    }
  });

  it('requires every declared admin handler to call the matching central guard', () => {
    const inventory = discoverRouteInventory();

    for (const [route, routePolicy] of Object.entries(registeredPolicies)) {
      for (const [rawMethod, methodPolicy] of Object.entries(routePolicy)) {
        if (methodPolicy?.access !== 'admin') continue;
        const method = rawMethod as HttpMethod;
        const source = inventory.sources.get(route);
        expect(source).toBeDefined();
        if (!source) continue;

        const expectedGuard = methodPolicy.runtime === 'local-only'
          ? 'requireLocalAdminApiAccess'
          : 'requireAdminApiAccess';
        const callNames = exportedHandlerCallNames(source, method);

        expect(callNames).not.toBeNull();
        expect(callNames?.has(expectedGuard)).toBe(true);
      }
    }
  });

  it('pins the five live-presale routes as public without adding an auth gate', () => {
    const expectedPresaleMethods: Readonly<Record<string, readonly HttpMethod[]>> = {
      '/api/presale/purchases': ['GET'],
      '/api/presale/referral/attribution': ['POST'],
      '/api/presale/referral/ranking': ['GET'],
      '/api/presale/referral/status': ['GET'],
      '/api/presale/status': ['GET'],
    };
    const registeredPresaleRoutes = Object.keys(registeredPolicies)
      .filter((route) => route.startsWith('/api/presale/'));

    expect(sorted(registeredPresaleRoutes)).toEqual(sorted(Object.keys(expectedPresaleMethods)));
    for (const [route, methods] of Object.entries(expectedPresaleMethods)) {
      expect(sorted(Object.keys(registeredPolicies[route] ?? {}))).toEqual(sorted(methods));
      for (const method of methods) {
        expect(registeredPolicies[route]?.[method]).toMatchObject({
          access: 'public',
          authContract: 'none',
          runtime: 'all',
        });
      }
    }
  });

  it('classifies every server-sensitive page bidirectionally', () => {
    const inventory = discoverSensitiveOperationalPages();

    expect(inventory.duplicatePages).toEqual([]);
    expect(sorted(inventory.pages.keys())).toEqual(sorted(Object.keys(OPERATIONAL_PAGE_POLICIES)));
    expect(OPERATIONAL_PAGE_POLICIES['/indexer']).toEqual({
      access: 'admin',
      authContract: 'admin-signed-wallet-allowlist',
      runtime: 'all',
      sideEffect: false,
      dataExposure: 'sensitive',
    });
  });
});
