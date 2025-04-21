export default function ImageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <section className="w-full h-full">{children}</section>;
}
