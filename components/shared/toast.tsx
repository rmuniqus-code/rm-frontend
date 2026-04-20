'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import styled, { keyframes } from 'styled-components'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextType {
  addToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>({ addToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer>
        {toasts.map(toast => (
          <ToastItem key={toast.id} $type={toast.type}>
            <ToastIcon $type={toast.type}>
              {toast.type === 'success' && <CheckCircle size={16} />}
              {toast.type === 'error' && <AlertCircle size={16} />}
              {toast.type === 'info' && <Info size={16} />}
            </ToastIcon>
            <ToastMessage>{toast.message}</ToastMessage>
            <ToastClose onClick={() => removeToast(toast.id)}>
              <X size={14} />
            </ToastClose>
          </ToastItem>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  )
}

const slideIn = keyframes`
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`

const ToastContainer = styled.div`
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 380px;
`

const ToastItem = styled.div<{ $type: ToastType }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--color-bg-card);
  border: 1px solid ${p =>
    p.$type === 'success' ? 'var(--color-success)' :
    p.$type === 'error' ? 'var(--color-danger)' :
    'var(--color-info)'};
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-lg);
  animation: ${slideIn} 250ms ease;
  min-width: 280px;
`

const ToastIcon = styled.span<{ $type: ToastType }>`
  display: flex;
  flex-shrink: 0;
  color: ${p =>
    p.$type === 'success' ? 'var(--color-success)' :
    p.$type === 'error' ? 'var(--color-danger)' :
    'var(--color-info)'};
`

const ToastMessage = styled.span`
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
`

const ToastClose = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--border-radius-sm);
  color: var(--color-text-muted);
  flex-shrink: 0;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
    color: var(--color-text);
  }
`
