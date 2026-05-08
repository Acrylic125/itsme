"use client";

import { LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useThemeStore } from "./theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeSwitcher() {
  const { theme, setTheme } = useThemeStore(
    useShallow(({ theme, setTheme }) => ({ theme, setTheme }))
  );

  const isLightTheme = theme === "light";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className="size-8 rounded-sm"
      aria-label={
        isLightTheme ? "Switch to dark theme" : "Switch to light theme"
      }
      onClick={() => setTheme(isLightTheme ? "dark" : "light")}
    >
      {isLightTheme ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}

export function ProfileMenu({
  user,
}: {
  user: {
    username: string | null;
    email: string;
  } | null;
}) {
  // const profileInitials = useMemo(() => {
  //   if (!user) {
  //     return null;
  //   }
  //   let profileInitials = user.username;
  //   if (!profileInitials) {
  //     return null;
  //   }
  //   return getProfileInitials(profileInitials);
  // }, [user?.username]);

  if (!user) {
    return <Button variant="outline">Get Started</Button>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-9 rounded-full p-0 overflow-hidden ring-offset-background"
          aria-label="Account menu"
        >
          <UserRound className="size-6 text-muted-foreground" />
          {/* {user.username ? (
              <img
                src={getProfileImageUrl(user.username)}
                alt={user.username ?? ""}
                className="object-cover w-full h-full"
              />
            ) : (
              <UserRound className="size-6 text-muted-foreground" />
            )} */}
          {/* <UserRound className="size-5 text-muted-foreground" /> */}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              {user.username && (
                <span className="text-sm font-medium text-foreground">
                  {user.username}
                </span>
              )}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            window.location.href = "/api/auth/microsoft/logout";
          }}
          variant="destructive"
        >
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// export function Navbar() {
//   return (

//   );
// }
