import { Sidebar } from './Sidebar';

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen" style={{ background: 'var(--base)' }}>
    <Sidebar />
    <main className="flex-1 min-w-0 overflow-auto" style={{ padding: '12px 16px' }}>
      {children}
    </main>
  </div>
);
