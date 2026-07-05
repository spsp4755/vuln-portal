import { Theme } from '@radix-ui/themes';
import './globals.css';
import { MainLayout } from '@/components/layout/MainLayout';
import { ThemeProvider } from '@/components/ThemeProvider';
import { KeepAlive } from '@/components/KeepAlive';

export const metadata = {
  title: 'Vuln Portal — 취약점 정보 수집 관리 포털',
  description: '5개 외부 소스 통합 취약점 정보 포털',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Theme
            appearance="dark"
            accentColor="cyan"
            grayColor="slate"
            radius="medium"
          >
            <KeepAlive />
            <MainLayout>{children}</MainLayout>
          </Theme>
        </ThemeProvider>
      </body>
    </html>
  );
}
