const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function GET() {
  return Response.json(
    { success: false, error: 'This endpoint has been retired' },
    { status: 410, headers: NO_STORE_HEADERS },
  );
}
