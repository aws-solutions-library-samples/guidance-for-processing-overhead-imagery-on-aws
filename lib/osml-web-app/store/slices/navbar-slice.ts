import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { NavbarState } from "../types";

const initialState: NavbarState = {
  drawerOpen: false,
};

export const navbarSlice = createSlice({
  name: "navbar",
  initialState,
  reducers: {
    toggleDrawer: (state) => {
      state.drawerOpen = !state.drawerOpen;
    },
    setDrawerOpen: (state, action: PayloadAction<boolean>) => {
      state.drawerOpen = action.payload;
    },
  },
});

export const { toggleDrawer, setDrawerOpen } = navbarSlice.actions;
export default navbarSlice.reducer;
