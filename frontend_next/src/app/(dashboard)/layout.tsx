import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { AuthProvider } from "@/contexts/AuthContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerSession();
  if (!user) redirect("/login");

  return (
    <AuthProvider initialUser={user}>
      <div className="flex flex-1 min-h-screen">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Topbar />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </AuthProvider>
  );
}
