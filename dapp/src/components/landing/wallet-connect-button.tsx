'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert, Wallet } from 'lucide-react';
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from 'wagmi';
import { useToast } from '@/hooks/use-toast';
import { useHasMounted } from '@/hooks/use-has-mounted';
import { useAuth } from '@/providers/auth-provider';
import { useTronLink } from '@/hooks/use-tronlink';
import { getVisibleWalletConnectors } from '@/lib/wallet-connectors';
import { UKI_PRESALE_CHAIN_ID, UKI_PRESALE_CHAIN_LABEL } from './sale-config';
import { WalletConnectorDialog } from './wallet-connector-dialog';

type WalletConnectButtonProps = {
  className?: string;
  label?: string;
  compactLabel?: string;
  showCompactText?: boolean;
};

export type { WalletConnectButtonProps };

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export { shortAddress };

function isSameWalletAddress(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function WalletConnectButton({
  className = '',
  label = 'Conectar wallet',
  compactLabel = 'Wallet',
  showCompactText = true,
}: WalletConnectButtonProps) {
  const { address, chainId, isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { user, isLoading: isAuthLoading, isWaitingForApproval, fetchUser } = useAuth();
  const {
    address: tronAddress,
    connect: connectTron,
    disconnect: disconnectTron,
    error: tronError,
    isConnected: isTronConnected,
    isInstalled: isTronInstalled,
    isLoading: isTronLoading,
  } = useTronLink();
  const { toast } = useToast();
  const [isConnectorDialogOpen, setIsConnectorDialogOpen] = useState(false);
  const hasMounted = useHasMounted();

  const evmConnectors = useMemo(
    () => (hasMounted ? getVisibleWalletConnectors(connectors) : []),
    [connectors, hasMounted],
  );
  const activeAddress = hasMounted && isConnected ? address : hasMounted && isTronConnected ? tronAddress : null;
  const activeWalletType = hasMounted && isConnected ? 'evm' : hasMounted && isTronConnected ? 'tron' : null;
  const isWrongChain = hasMounted && isConnected && chainId !== UKI_PRESALE_CHAIN_ID;
  const isAuthenticatedWallet = isSameWalletAddress(user?.walletAddress, activeAddress);
  const isBusy = hasMounted && (isPending || isSwitching || isAuthLoading || isWaitingForApproval || isTronLoading);

  const handleConnectEvm = async (connector: Connector) => {
    try {
      const result = await connectAsync({ connector, chainId: UKI_PRESALE_CHAIN_ID });
      const connectedAddress = result.accounts?.[0] ?? address;

      if (connectedAddress) {
        setIsConnectorDialogOpen(false);
        await fetchUser(connectedAddress, {
          evmConnector: connector,
          promptForSignature: true,
          walletType: 'evm',
        });
      }
    } catch {
      toast({
        title: 'Conexión fallida',
        description: 'Aprueba la conexión en tu wallet y vuelve a intentarlo.',
        variant: 'destructive',
      });
    }
  };

  const handleConnectTron = async () => {
    try {
      const connectedAddress = isTronConnected && tronAddress ? tronAddress : await connectTron();

      if (connectedAddress) {
        setIsConnectorDialogOpen(false);
        await fetchUser(connectedAddress, { promptForSignature: true, walletType: 'tron' });
        return;
      }

      toast({
        title: 'TronLink no conectado',
        description: tronError || 'Activa TronLink y aprueba la conexión.',
        variant: 'destructive',
      });
    } catch {
      toast({
        title: 'Conexión fallida',
        description: 'Aprueba la conexión en TronLink y vuelve a intentarlo.',
        variant: 'destructive',
      });
    }
  };

  const handleClick = async () => {
    if (!hasMounted) return;
    if (isBusy) return;

    if (isWrongChain) {
      switchChain(
        { chainId: UKI_PRESALE_CHAIN_ID },
        {
          onError: () => {
            toast({
              title: 'Cambio de red fallido',
              description: `Cambia tu wallet a ${UKI_PRESALE_CHAIN_LABEL}.`,
              variant: 'destructive',
            });
          },
        },
      );
      return;
    }

    if (activeWalletType && activeAddress) {
      if (!isAuthenticatedWallet) {
        await fetchUser(activeAddress, { promptForSignature: true, walletType: activeWalletType });
        return;
      }

      if (activeWalletType === 'evm') {
        disconnect();
      } else {
        disconnectTron();
      }
      return;
    }

    if (evmConnectors.length === 0 && !isTronInstalled) {
      toast({
        title: 'Wallet no encontrada',
        description: 'Instala una wallet EVM compatible para conectar.',
        variant: 'destructive',
      });
      return;
    }

    setIsConnectorDialogOpen(true);
  };

  const text = isBusy
    ? isWaitingForApproval
      ? 'Firmar mensaje'
      : 'Conectando...'
    : isWrongChain
      ? 'Cambiar a BSC'
      : activeAddress
        ? isAuthenticatedWallet
          ? shortAddress(activeAddress)
          : 'Firmar'
        : label;
  const compactText = activeAddress ? (isAuthenticatedWallet ? shortAddress(activeAddress) : 'Firmar') : compactLabel;

  return (
    <>
      <button type="button" onClick={handleClick} disabled={isBusy} className={`uki-wallet-button ${className}`}>
        <Wallet className="h-4 w-4" strokeWidth={1.8} />
        <span className={showCompactText ? 'hidden sm:inline' : ''}>{text}</span>
        {showCompactText ? <span className="sm:hidden">{compactText}</span> : null}
      </button>

      <WalletConnectorDialog
        open={isConnectorDialogOpen}
        onOpenChange={setIsConnectorDialogOpen}
        connectors={evmConnectors}
        onSelectConnector={handleConnectEvm}
        isConnecting={isPending}
        description="Elige una wallet EVM para BSC o conecta TronLink en modo TRON."
        tronLinkNative={{
          error: tronError,
          isInstalled: isTronInstalled,
          isLoading: isTronLoading,
          onSelect: handleConnectTron,
        }}
      />
    </>
  );
}

export function WalletStatusLabel() {
  const { address, chainId, isConnected } = useAccount();
  const { address: tronAddress, isConnected: isTronConnected } = useTronLink();
  const { user, isLoading } = useAuth();

  if (!isConnected && (!isTronConnected || !tronAddress)) {
    return <span className="text-[#ff75aa]">No conectada</span>;
  }

  if (!isConnected && isTronConnected && tronAddress) {
    return isSameWalletAddress(user?.walletAddress, tronAddress) ? (
      <span className="text-[var(--uki-cyan)]">{shortAddress(tronAddress)}</span>
    ) : (
      <span className="text-[#ffcc6d]">Firma requerida</span>
    );
  }

  if (!address) {
    return <span className="text-[#ff75aa]">No conectada</span>;
  }

  if (chainId !== UKI_PRESALE_CHAIN_ID) {
    return <span className="text-[#ffcc6d]">Red incorrecta</span>;
  }

  if (isLoading) {
    return <span className="text-[#ffcc6d]">Revisando auth</span>;
  }

  if (!isSameWalletAddress(user?.walletAddress, address)) {
    return <span className="text-[#ffcc6d]">Firma requerida</span>;
  }

  return <span className="text-[var(--uki-cyan)]">{shortAddress(address)}</span>;
}

export function WalletStateCallout() {
  const { address, chainId, isConnected } = useAccount();
  const { address: tronAddress, isConnected: isTronConnected } = useTronLink();
  const { user, isLoading, isWaitingForApproval } = useAuth();
  const isWrongChain = isConnected && chainId !== UKI_PRESALE_CHAIN_ID;
  const activeAddress = isConnected ? address : isTronConnected ? tronAddress : null;
  const isAuthenticatedWallet = isSameWalletAddress(user?.walletAddress, activeAddress);

  if (!isConnected && (!isTronConnected || !tronAddress)) {
    return (
      <div className="uki-state-callout uki-state-callout-warning">
        <Wallet className="h-4 w-4" strokeWidth={1.8} />
        <div>
          <p>Wallet desconectada</p>
          <span>Conecta una wallet EVM para revisar datos personales de preventa y vesting.</span>
        </div>
      </div>
    );
  }

  if (!isConnected && isTronConnected && tronAddress) {
    return (
      <div className="uki-state-callout uki-state-callout-warning">
        <ShieldAlert className="h-4 w-4" strokeWidth={1.8} />
        <div>
          <p>TronLink en TRON</p>
          <span>Para comprar o consultar vesting en BSC, conecta TronLink en modo EVM o una wallet EVM.</span>
        </div>
      </div>
    );
  }

  if (isWrongChain) {
    return (
      <div className="uki-state-callout uki-state-callout-warning">
        <ShieldAlert className="h-4 w-4" strokeWidth={1.8} />
        <div>
          <p>Red incorrecta</p>
          <span>Cambia a {UKI_PRESALE_CHAIN_LABEL} antes de aprobar, comprar o consultar vesting.</span>
        </div>
      </div>
    );
  }

  if (isLoading || isWaitingForApproval) {
    return (
      <div className="uki-state-callout uki-state-callout-warning">
        <Wallet className="h-4 w-4" strokeWidth={1.8} />
        <div>
          <p>{isWaitingForApproval ? 'Firma pendiente' : 'Revisando wallet'}</p>
          <span>{isWaitingForApproval ? 'Aprueba el mensaje de login en tu wallet.' : 'Confirmando tu sesión.'}</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticatedWallet) {
    return (
      <div className="uki-state-callout uki-state-callout-warning">
        <ShieldAlert className="h-4 w-4" strokeWidth={1.8} />
        <div>
          <p>Firma requerida</p>
          <span>Firma el challenge de wallet para usar la sesión autenticada.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="uki-state-callout uki-state-callout-ready">
      <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />
      <div>
        <p>Wallet lista</p>
        <span>{address ? shortAddress(address) : '--'} conectada en {UKI_PRESALE_CHAIN_LABEL}.</span>
      </div>
    </div>
  );
}
