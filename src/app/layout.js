import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Arduino C2 Interface',
  description: 'Web bases Arduino C2 interface for flashing, reading and erasing SiLabs EFM8 based MCUs',
  openGraph: {
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
      },
    ]
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-100">
      <body className="d-flex flex-column h-100">
        {children}
      </body>
    </html>
  );
}
