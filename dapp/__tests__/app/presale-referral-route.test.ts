import { GET } from '@/app/ref/[code]/route';

jest.mock('next/server', () => ({
  NextResponse: {
    redirect: (url: URL) => {
      const headers = new Headers({ location: url.toString() });

      return {
        status: 307,
        headers,
        cookies: {
          set: (name: string, value: string) => {
            headers.set('set-cookie', `${name}=${value}`);
          },
        },
      };
    },
  },
}));

describe('/ref/[code]', () => {
  it('guarda el codigo de referido en cookie y redirige a la preventa', async () => {
    const response = await GET({
      url: 'https://cukieshub.eurekand.com/ref/uki-bc563d06ae',
      headers: new Headers(),
    } as never, {
      params: Promise.resolve({ code: 'uki-bc563d06ae' }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://cukieshub.eurekand.com/#presale-console');
    expect(response.headers.get('set-cookie')).toContain('ukiReferralCode=uki-bc563d06ae');
  });

  it('usa las cabeceras forwarded cuando Next recibe la URL interna de Coolify', async () => {
    const response = await GET({
      url: 'http://0.0.0.0:3000/ref/uki-bc563d06ae',
      headers: new Headers({
        'x-forwarded-host': 'cukieshub.eurekand.com',
        'x-forwarded-proto': 'https',
      }),
    } as never, {
      params: Promise.resolve({ code: 'uki-bc563d06ae' }),
    });

    expect(response.headers.get('location')).toBe('https://cukieshub.eurekand.com/#presale-console');
  });
});
