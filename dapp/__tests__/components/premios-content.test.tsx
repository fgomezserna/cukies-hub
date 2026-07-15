import { fireEvent, render, screen, within } from '@testing-library/react';
import { parseUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';

import { UKI_PRESALE_CHAIN_ID } from '@/components/landing/sale-config';
import { PremiosContent } from '@/components/premios/premios-content';

jest.mock('wagmi', () => ({
  useAccount: jest.fn(),
  useReadContract: jest.fn(),
}));
jest.mock('lucide-react', () => ({
  CheckCircle2: () => null,
  Crown: () => null,
  Gift: () => null,
  Lock: () => null,
  Sparkles: () => null,
  Star: () => null,
  Ticket: () => null,
  Trophy: () => null,
  Users: () => null,
}));

jest.mock('@/components/landing/header', () => ({ LandingHeader: () => null }));
jest.mock('@/components/landing/footer', () => ({ LandingFooter: () => null }));
jest.mock('@/components/landing/presale-referral-link-panel', () => ({
  PresaleReferralLinkPanel: () => null,
}));
jest.mock('@/components/landing/scroll-reveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/providers/public-locale-provider', () => ({
  usePublicLocale: () => ({ locale: 'es', setLocale: jest.fn() }),
}));
jest.mock('@/lib/contracts/uki-sale', () => ({
  presaleAbi: [],
  ukiSaleContracts: {
    presaleAddress: '0x1111111111111111111111111111111111111111',
  },
}));

const WALLET_ADDRESS = '0x2222222222222222222222222222222222222222';
const PRESALE_ADDRESS = '0x1111111111111111111111111111111111111111';
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseReadContract = useReadContract as jest.MockedFunction<typeof useReadContract>;
const refetchPurchasedUki = jest.fn();

function mockAccount(address?: `0x${string}`, isConnected = Boolean(address)) {
  mockUseAccount.mockReturnValue({
    address,
    isConnected,
  } as ReturnType<typeof useAccount>);
}

function mockPurchaseRead(data?: bigint, isError = false) {
  mockUseReadContract.mockReturnValue({
    data,
    isError,
    refetch: refetchPurchasedUki,
  } as unknown as ReturnType<typeof useReadContract>);
}

function getPurchaseProgressSection() {
  const section = document.querySelector('#progreso-cukie-master');
  expect(section).not.toBeNull();
  return within(section as HTMLElement);
}

describe('PremiosContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccount();
    mockPurchaseRead();
  });

  it('pide conectar la wallet sin mostrar rangos inventados si wagmi aún no expone una dirección', () => {
    mockAccount(undefined, true);

    render(<PremiosContent />);

    const progress = getPurchaseProgressSection();
    expect(progress.getByRole('heading', {
      level: 2,
      name: 'Conecta tu wallet para ver tu progreso Cukie Master',
    })).toBeInTheDocument();
    expect(progress.queryByRole('listitem')).not.toBeInTheDocument();
    expect(mockUseReadContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'ukiPurchased',
      args: undefined,
      query: expect.objectContaining({ enabled: false }),
    }));
  });

  it('lee ukiPurchased en BSC y muestra dos objetivos alcanzados con 40.000 UKI', () => {
    mockAccount(WALLET_ADDRESS);
    mockPurchaseRead(parseUnits('40000', 18));

    render(<PremiosContent />);

    const progress = getPurchaseProgressSection();
    expect(progress.getByRole('heading', { level: 2, name: 'Has comprado 40.000 UKI' })).toBeInTheDocument();
    expect(progress.getAllByText('Alcanzado')).toHaveLength(2);
    expect(progress.getByRole('progressbar', {
      name: 'Rangos de Cukie Master alcanzados',
    })).toHaveAttribute('aria-valuenow', '2');
    expect(mockUseReadContract).toHaveBeenCalledWith(expect.objectContaining({
      chainId: UKI_PRESALE_CHAIN_ID,
      address: PRESALE_ADDRESS,
      functionName: 'ukiPurchased',
      args: [WALLET_ADDRESS],
      query: expect.objectContaining({ enabled: true, staleTime: 15_000 }),
    }));
  });

  it('trata 0n como una lectura válida y no como un estado de carga', () => {
    mockAccount(WALLET_ADDRESS);
    mockPurchaseRead(BigInt(0));

    render(<PremiosContent />);

    const progress = getPurchaseProgressSection();
    expect(progress.getByRole('heading', { level: 2, name: 'Has comprado 0 UKI' })).toBeInTheDocument();
    expect(progress.getByText('En progreso')).toBeInTheDocument();
    expect(progress.queryByRole('status')).not.toBeInTheDocument();
  });

  it('mantiene el tramo de 20.000 UKI pendiente hasta el último wei', () => {
    mockAccount(WALLET_ADDRESS);
    mockPurchaseRead(parseUnits('20000', 18) - BigInt(1));

    render(<PremiosContent />);

    const bronzeTier = screen.getByText('Tier Bronce').closest('article');
    expect(bronzeTier).not.toBeNull();
    expect(within(bronzeTier as HTMLElement).getByText('Siguiente tramo')).toBeInTheDocument();
    expect(within(bronzeTier as HTMLElement).queryByText('Conseguido')).not.toBeInTheDocument();
    expect(getPurchaseProgressSection().getByRole('progressbar', {
      name: 'Porcentaje completado hacia el siguiente tramo de sorteo',
    })).toHaveAttribute('aria-valuetext', '99% completado');
  });

  it('muestra un estado de carga mientras la lectura on-chain está pendiente', () => {
    mockAccount(WALLET_ADDRESS);

    render(<PremiosContent />);

    expect(getPurchaseProgressSection().getByRole('status')).toHaveTextContent(
      'Consultando tus compras de preventa…',
    );
  });

  it('expone el error de lectura y permite reintentar', () => {
    mockAccount(WALLET_ADDRESS);
    mockPurchaseRead(undefined, true);

    render(<PremiosContent />);

    const progress = getPurchaseProgressSection();
    expect(progress.getByRole('alert')).toHaveTextContent('No hemos podido leer tus UKI comprados.');
    fireEvent.click(progress.getByRole('button', { name: 'Reintentar' }));
    expect(refetchPurchasedUki).toHaveBeenCalledTimes(1);
  });
});
