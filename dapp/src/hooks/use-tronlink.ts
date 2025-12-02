'use client';

import { useState, useEffect, useCallback } from 'react';

declare global {
  interface Window {
    tronWeb?: any;
    tronLink?: any;
  }
}

interface TronLinkState {
  isInstalled: boolean;
  isConnected: boolean;
  address: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useTronLink() {
  const [state, setState] = useState<TronLinkState>({
    isInstalled: false,
    isConnected: false,
    address: null,
    isLoading: true,
    error: null,
  });

  // Check if TronLink is installed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkTronLink = () => {
        const isInstalled = !!(window.tronWeb || window.tronLink);
        setState((prev) => ({ ...prev, isInstalled, isLoading: false }));
      };

      checkTronLink();

      // Listen for TronLink installation
      const interval = setInterval(checkTronLink, 1000);
      return () => clearInterval(interval);
    }
  }, []);

  // Check connection status
  useEffect(() => {
    if (typeof window !== 'undefined' && window.tronWeb) {
      const checkConnection = () => {
        try {
          const tronWeb = window.tronWeb;
          if (tronWeb && tronWeb.ready) {
            const address = tronWeb.defaultAddress?.base58 || null;
            setState((prev) => ({
              ...prev,
              isConnected: !!address,
              address,
              error: null,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              isConnected: false,
              address: null,
            }));
          }
        } catch (error) {
          console.error('Error checking TronLink connection:', error);
        }
      };

      checkConnection();

      // Listen for account changes
      const interval = setInterval(checkConnection, 1000);
      return () => clearInterval(interval);
    }
  }, [state.isInstalled]);

  const connect = useCallback(async () => {
    if (typeof window === 'undefined') {
      setState((prev) => ({
        ...prev,
        error: 'TronLink is not available',
      }));
      return;
    }

    try {
      if (window.tronWeb && window.tronWeb.ready) {
        const address = window.tronWeb.defaultAddress?.base58;
        setState((prev) => ({
          ...prev,
          isConnected: true,
          address,
          error: null,
        }));
        return address;
      } else {
        // Request connection
        if (window.tronLink) {
          await window.tronLink.request({
            method: 'tron_requestAccounts',
          });

          // Wait a bit for TronLink to update
          setTimeout(() => {
            if (window.tronWeb && window.tronWeb.ready) {
              const address = window.tronWeb.defaultAddress?.base58;
              setState((prev) => ({
                ...prev,
                isConnected: true,
                address,
                error: null,
              }));
            }
          }, 1000);
        } else {
          setState((prev) => ({
            ...prev,
            error: 'Please install TronLink extension',
          }));
        }
      }
    } catch (error: any) {
      console.error('Error connecting to TronLink:', error);
      setState((prev) => ({
        ...prev,
        error: error?.message || 'Failed to connect to TronLink',
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isConnected: false,
      address: null,
    }));
  }, []);

  return {
    ...state,
    connect,
    disconnect,
  };
}

