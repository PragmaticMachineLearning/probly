import "./globals.css";

import { ReactNode } from "react";

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js"></script>
      </head>
      <body>
        {/* Add any global components like headers or footers here */}
        {children}
      </body>
    </html>
  );
}
