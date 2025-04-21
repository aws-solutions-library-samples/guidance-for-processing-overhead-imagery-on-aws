"use client";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Button,
} from "@heroui/react";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setDrawerOpen } from "@/store/slices/navbar-slice";

interface SidebarProps {
  children?: React.ReactNode;
}

export const Sidebar = ({ children }: SidebarProps) => {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.navbar.drawerOpen);

  const onOpenChange = (open: boolean) => {
    dispatch(setDrawerOpen(open));
  };

  return (
    <Drawer
      classNames={{
        base: [
          "top-[var(--navbar-height)]",
          "h-[calc(100vh-var(--navbar-height))]",
          "pointer-events-auto",
          "w-80"
        ].join(" "),
        wrapper: "!pointer-events-none shadow-xl",
        backdrop: "!hidden",
      }}
      isDismissable={false}
      isOpen={isOpen}
      placement="left"
      onOpenChange={onOpenChange}
    >
      <DrawerContent>
        {(onClose) => (
          <>
            <DrawerBody className="flex-grow overflow-y-auto">
              {children}
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
};
