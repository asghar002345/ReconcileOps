import type { ReactNode } from 'react';
import './StatusBanner.css';

type Props = {
  tone: 'info' | 'success' | 'danger' | 'warning';
  title: string;
  children?: ReactNode;
};

export function StatusBanner({ tone, title, children }: Props) {
  const isAlert = tone === 'danger' || tone === 'warning';
  return (
    <div
      className={`banner banner--${tone}`}
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
    >
      <strong>{title}</strong>
      {children ? <div className="banner__body">{children}</div> : null}
    </div>
  );
}
