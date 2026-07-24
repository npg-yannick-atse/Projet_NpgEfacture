import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ef_session";
const PUBLIC_PATHS = ["/login"];

const DEBUG = process.env.EF_AUTH_DEBUG === "1";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(
      `[proxy] ${req.method} ${pathname} — session=${session ? "yes" : "no"} cookies=${req.cookies
        .getAll()
        .map((c) => c.name)
        .join(",") || "(none)"}`,
    );
  }

  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (session && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|css|js)$).*)"],
};
