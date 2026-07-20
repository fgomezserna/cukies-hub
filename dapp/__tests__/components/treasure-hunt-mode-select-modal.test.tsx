import { fireEvent, render, screen } from '@testing-library/react';

import ModeSelectModal from '../../../games/sybil-slayer/src/components/mode-select-modal';

describe('Treasure Hunt mode selector', () => {
  it('turns standalone multiplayer into an explicit Hub entry action', () => {
    const onSelectMode = jest.fn();
    render(
      <ModeSelectModal
        open
        onClose={jest.fn()}
        onSelectMode={onSelectMode}
        singlePlayerEntryState="practice"
        multiplayerEntryState="hub"
      />,
    );

    const multiplayerButton = screen.getByTestId('treasure-hunt-multiplayer-mode');
    expect(multiplayerButton).toBeEnabled();
    expect(multiplayerButton).toHaveAttribute('data-multiplayer-entry', 'hub');
    expect(screen.getByText('ABRIR HUB')).toBeInTheDocument();
    expect(screen.getByText(/conecta la wallet/i)).toBeInTheDocument();

    fireEvent.click(multiplayerButton);
    expect(onSelectMode).toHaveBeenCalledWith('multiplayer');
  });

  it('blocks multiplayer inside the iframe until the authenticated handshake is ready', () => {
    const onSelectMode = jest.fn();
    const { rerender } = render(
      <ModeSelectModal
        open
        onClose={jest.fn()}
        onSelectMode={onSelectMode}
        singlePlayerEntryState="ready"
        multiplayerEntryState="connecting"
      />,
    );

    const connectingButton = screen.getByTestId('treasure-hunt-multiplayer-mode');
    expect(connectingButton).toBeDisabled();
    expect(screen.getByText('CONECTA WALLET')).toBeInTheDocument();
    fireEvent.click(connectingButton);
    expect(onSelectMode).not.toHaveBeenCalled();

    rerender(
      <ModeSelectModal
        open
        onClose={jest.fn()}
        onSelectMode={onSelectMode}
        singlePlayerEntryState="ready"
        multiplayerEntryState="ready"
      />,
    );

    const readyButton = screen.getByTestId('treasure-hunt-multiplayer-mode');
    expect(readyButton).toBeEnabled();
    expect(screen.getByText('JUGAR 2P')).toBeInTheDocument();
    fireEvent.click(readyButton);
    expect(onSelectMode).toHaveBeenCalledWith('multiplayer');
  });

  it('requires the signed Hub wallet for 1P as well as multiplayer', () => {
    const onSelectMode = jest.fn();
    const { rerender } = render(
      <ModeSelectModal
        open
        onClose={jest.fn()}
        onSelectMode={onSelectMode}
        singlePlayerEntryState="connecting"
        multiplayerEntryState="connecting"
      />,
    );

    const blockedButton = screen.getByTestId('treasure-hunt-single-player-mode');
    expect(blockedButton).toBeDisabled();
    expect(blockedButton).toHaveAttribute('data-single-player-entry', 'connecting');
    expect(screen.getAllByText('CONECTA WALLET')).toHaveLength(2);
    fireEvent.click(blockedButton);
    expect(onSelectMode).not.toHaveBeenCalled();

    rerender(
      <ModeSelectModal
        open
        onClose={jest.fn()}
        onSelectMode={onSelectMode}
        singlePlayerEntryState="ready"
        multiplayerEntryState="ready"
      />,
    );
    const readyButton = screen.getByTestId('treasure-hunt-single-player-mode');
    expect(readyButton).toBeEnabled();
    expect(screen.getByText('Wallet firmada. Tu próxima partida podrá entrar en el ranking oficial.')).toBeInTheDocument();
    fireEvent.click(readyButton);
    expect(onSelectMode).toHaveBeenCalledWith('single');
  });
});
