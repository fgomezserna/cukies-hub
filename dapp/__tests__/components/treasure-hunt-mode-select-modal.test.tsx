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
        multiplayerEntryState="ready"
      />,
    );

    const readyButton = screen.getByTestId('treasure-hunt-multiplayer-mode');
    expect(readyButton).toBeEnabled();
    expect(screen.getByText('JUGAR 2P')).toBeInTheDocument();
    fireEvent.click(readyButton);
    expect(onSelectMode).toHaveBeenCalledWith('multiplayer');
  });
});
