import { GET } from '@/app/api/ready/route';
import { checkDeploymentReadiness } from '@/lib/deployment-readiness';

jest.mock('@/lib/deployment-readiness', () => ({
  checkDeploymentReadiness: jest.fn(),
}));

const mockReadiness = checkDeploymentReadiness as jest.MockedFunction<typeof checkDeploymentReadiness>;

describe('GET /api/ready', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_BUILD_SHA;
    delete process.env.SOURCE_COMMIT;
    delete process.env.GIT_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.NEXT_PUBLIC_CONFIG_HASH;
    delete process.env.CUKIES_BUILD_ENV_HASH;
    delete process.env.CUKIES_IMAGE_REVISION;
  });

  it('devuelve 200 y solo identificadores públicos válidos cuando Mongo está listo', async () => {
    process.env.NEXT_PUBLIC_BUILD_SHA = 'ABCDEF1234567';
    process.env.NEXT_PUBLIC_CONFIG_HASH = 'A'.repeat(64);
    mockReadiness.mockResolvedValue({ status: 'ready' });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      status: 'ready',
      gitSha: 'abcdef1234567',
      configHash: 'a'.repeat(64),
    });
  });

  it('devuelve 503 y no filtra errores ni configuración cuando no está listo', async () => {
    process.env.SOURCE_COMMIT = 'private-not-a-sha';
    process.env.NEXT_PUBLIC_CONFIG_HASH = 'private-config';
    process.env.CUKIES_IMAGE_REVISION = 'private-image';
    mockReadiness.mockResolvedValue({ status: 'not_ready' });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'not_ready' });
  });

  it('identifica el runtime servido aunque la imagen reutilizada conserve metadatos anteriores', async () => {
    process.env.GIT_COMMIT_SHA = 'b'.repeat(40);
    process.env.NEXT_PUBLIC_BUILD_SHA = 'a'.repeat(40);
    process.env.CUKIES_BUILD_ENV_HASH = 'c'.repeat(64);
    process.env.CUKIES_IMAGE_REVISION = 'd'.repeat(40);
    mockReadiness.mockResolvedValue({ status: 'ready' });
    expect(await (await GET()).json()).toEqual({
      status: 'ready',
      gitSha: 'b'.repeat(40),
      configHash: 'c'.repeat(64),
      imageSha: 'd'.repeat(40),
    });
  });

  it('propaga 503 cuando el guard central de readiness detecta drain', async () => {
    mockReadiness.mockResolvedValue({ status: 'not_ready' });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(mockReadiness).toHaveBeenCalledTimes(1);
  });
});
