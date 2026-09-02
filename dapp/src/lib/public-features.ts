export function isAmbassadorsPubliclyListed(): boolean {
  return process.env.NEXT_PUBLIC_AMBASSADORS_VISIBLE === 'true';
}
