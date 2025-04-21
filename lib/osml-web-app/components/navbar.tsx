import {
  Navbar as HeroUINavbar,
  NavbarContent,
  NavbarBrand,
  NavbarItem,
} from "@heroui/navbar";
import { Button } from "@heroui/button";
import { Link } from "@heroui/link";
import NextLink from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";
import {
  GithubIcon,
  Logo,
  MenuIcon,
  LogoutIcon,
  LoginIcon,
} from "@/components/icons";
import { useAppDispatch } from "@/store/hooks";
import { toggleDrawer } from "@/store/slices/navbar-slice";

export const Navbar = () => {
  const dispatch = useAppDispatch();
  const { data: session, status } = useSession();
  const router = useRouter();

  const handleAuthClick = async () => {
    if (session) {
      await signOut({ redirect: false });
      router.push("/"); // Redirect to home page after logout
    } else {
      await signIn();
    }
  };

  return (
    <HeroUINavbar
      className="w-full max-w-none px-0"
      classNames={{
        wrapper: "max-w-none w-full px-0",
        base: "max-w-none w-full px-0",
      }}
      position="sticky"
    >
      <NavbarContent className="w-full px-6" justify="start">
        <Button
          isIconOnly
          aria-label="Menu"
          className="mr-2"
          variant="light"
          onPress={() => dispatch(toggleDrawer())}
        >
          <MenuIcon />
        </Button>
        <NavbarBrand as="li" className="gap-3">
          <NextLink className="flex justify-start items-center gap-1" href="/">
            <Logo />
            <p className="font-bold text-inherit">OversightML</p>
          </NextLink>
        </NavbarBrand>

        <div className="flex-grow" />

        <NavbarItem className="hidden sm:flex gap-2">
          <Link isExternal aria-label="Github" href={siteConfig.links.github}>
            <GithubIcon className="text-default-500" />
          </Link>
          <ThemeSwitch />
          <Button
            startContent={session ? <LogoutIcon /> : <LoginIcon />}
            variant="light"
            onPress={handleAuthClick}
          >
            {session ? "Logout" : "Login"}
          </Button>
        </NavbarItem>
      </NavbarContent>
    </HeroUINavbar>
  );
};
