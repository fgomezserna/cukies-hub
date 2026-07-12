const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function gone() {
  return Response.json(
    { error: 'This authorization endpoint has been retired' },
    { status: 410, headers: NO_STORE_HEADERS },
  );
}

export async function POST() {
  return gone();
}

export async function OPTIONS() {
  return gone();
}
