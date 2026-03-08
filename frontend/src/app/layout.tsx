import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Compass – Skill Gap & Learning Roadmap",
  description: "Analyze your skills, find your gaps, and get a personalized learning roadmap for your target role.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
