import { Sidebar, MobileNav } from "@/components/shell/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <MobileNav />
        <main className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
