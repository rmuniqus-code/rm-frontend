'use client'

import styled, { keyframes } from 'styled-components'

const shimmer = keyframes`
  0%   { background-position: -400px 0 }
  100% { background-position: 400px 0 }
`

const spin = keyframes`
  to { transform: rotate(360deg); }
`

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 16px;
`

const SpinnerRing = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: ${spin} 0.75s linear infinite;
`

const Message = styled.p`
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
`

const SkeletonWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 0;
  width: 100%;
`

const SkeletonRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`

const SkeletonCell = styled.div<{ $w?: number; $flex?: number }>`
  ${p => p.$w ? `width: ${p.$w}px;` : ''}
  ${p => p.$flex ? `flex: ${p.$flex};` : ''}
  height: 36px;
  border-radius: var(--border-radius-sm);
  background: linear-gradient(
    90deg,
    var(--color-border-light) 25%,
    var(--color-bg-card)      50%,
    var(--color-border-light) 75%
  );
  background-size: 800px 100%;
  animation: ${shimmer} 1.4s ease-in-out infinite;
  flex-shrink: 0;
`

/** Full-page spinner — use for initial data fetch */
export function PageLoader({ message = 'Loading…' }: { message?: string }) {
  return (
    <Wrapper>
      <SpinnerRing />
      <Message>{message}</Message>
    </Wrapper>
  )
}

/** Skeleton table rows — use inline inside a table area while fetching */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  const widths = [160, 120, 100, 90, 80, 70]
  return (
    <SkeletonWrap>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <SkeletonCell
              key={j}
              $w={widths[j % widths.length]}
              style={{ opacity: 1 - i * 0.12 }}
            />
          ))}
          <SkeletonCell $flex={1} />
        </SkeletonRow>
      ))}
    </SkeletonWrap>
  )
}

export default PageLoader
