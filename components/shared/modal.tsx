'use client'

import { ReactNode, useEffect, useCallback } from 'react'
import styled, { keyframes } from 'styled-components'
import { X } from 'lucide-react'

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(24px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
`

const Overlay = styled.div<{ $zIndex?: number }>`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  z-index: ${p => p.$zIndex ?? 100};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: ${fadeIn} 150ms ease;
`

const ModalContainer = styled.div<{ $size: 'sm' | 'md' | 'lg' | 'xl' }>`
  background: var(--color-bg-card);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: ${p =>
    p.$size === 'sm' ? '480px' :
    p.$size === 'md' ? '640px' :
    p.$size === 'lg' ? '800px' :
    '1024px'};
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  animation: ${slideUp} 200ms ease;
`

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
`

const ModalTitle = styled.div`
  h2 {
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text);
    line-height: 1.3;
  }

  p {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin-top: 2px;
  }
`

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius);
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
  flex-shrink: 0;

  &:hover {
    background: var(--color-border-light);
    color: var(--color-text);
  }
`

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px;
`

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
`

// Section building blocks for modal content
const Section = styled.div`
  &:not(:last-child) {
    margin-bottom: 20px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--color-border-light);
  }
`

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 12px;
`

const DetailGrid = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${p => p.$cols ?? 2}, 1fr);
  gap: 12px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`

const DetailItem = styled.div`
  label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }

  span {
    font-size: 14px;
    color: var(--color-text);
    font-weight: 500;
  }
`

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: ReactNode
  footer?: ReactNode
  /** Override default z-index (100) — use for modals that open above other modals */
  zIndex?: number
}

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
  zIndex,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [open, handleKeyDown])

  if (!open) return null

  return (
    <Overlay onClick={onClose} $zIndex={zIndex}>
      <ModalContainer $size={size} onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </CloseButton>
        </ModalHeader>
        <ModalBody>{children}</ModalBody>
        {footer && <ModalFooter>{footer}</ModalFooter>}
      </ModalContainer>
    </Overlay>
  )
}

export { Section, SectionTitle, DetailGrid, DetailItem, ModalFooter }
