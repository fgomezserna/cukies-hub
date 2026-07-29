import { fireEvent, render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';

import ProfileBackButton from '@/components/profile/profile-back-button';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  ArrowLeft: () => null,
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe('ProfileBackButton', () => {
  const back = jest.fn();
  const push = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ back, push } as unknown as ReturnType<typeof useRouter>);
  });

  it('vuelve al origen cuando el perfil se abrió desde la navegación', () => {
    Object.defineProperty(window.history, 'length', { configurable: true, value: 2 });
    render(<ProfileBackButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Volver a la pantalla anterior' }));

    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('vuelve a Treasure Hunt cuando no existe historial previo', () => {
    Object.defineProperty(window.history, 'length', { configurable: true, value: 1 });
    render(<ProfileBackButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Volver a la pantalla anterior' }));

    expect(push).toHaveBeenCalledWith('/games/treasure-hunt');
    expect(back).not.toHaveBeenCalled();
  });
});
