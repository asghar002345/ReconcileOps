import type { ReactNode } from 'react';
import './StatusBanner.css';

type Props = {
  tone: 'info' | 'success' | 'danger' | 'warning';
  title: string;
  children?: ReactNode;
};

export function StatusBanner({ tone, title, children }: Props) {
  return (
    <div className={`banner banner--${tone}`} role="status">
      <strong>{title}</strong>
      {children ? <div className="banner__body">{children}</div> : null}
    </div>
  );
}
