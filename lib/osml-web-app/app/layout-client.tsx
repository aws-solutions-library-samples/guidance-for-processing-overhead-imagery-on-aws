"use client";

import { Provider } from "react-redux";
import clsx from "clsx";

import { Providers } from "./providers";

import { store } from "@/store/store";
import { fontSans } from "@/config/fonts";
import { Navbar } from "@/components/navbar";

import "cesium/Build/Cesium/Widgets/widgets.css";

const styles = {
  "--navbar-height": "4rem",
} as React.CSSProperties;

export function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning lang="en">
      <head />
      <body
        className={clsx(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable,
        )}
        style={styles}
      >
        <Provider store={store}>
          <Providers themeProps={{ attribute: "class", defaultTheme: "dark" }}>
            <div className="flex flex-col h-screen">
              <Navbar />
              <main className="flex-grow w-full h-[calc(100vh-var(--navbar-height))]">
                {children}
              </main>
            </div>
          </Providers>
        </Provider>
      </body>
    </html>
  );
}
