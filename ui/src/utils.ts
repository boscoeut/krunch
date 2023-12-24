import { PublicKey } from "@solana/web3.js";
import { AMOUNT_DECIMALS } from "utils/dist/constants";
import * as anchor from "@coral-xyz/anchor";

export const openSidebar = () => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.setProperty('--SideNavigation-slideIn', '1');
  }
};

export const closeSidebar = () => {
  if (typeof document !== 'undefined') {
    document.documentElement.style.removeProperty('--SideNavigation-slideIn');
    document.body.style.removeProperty('overflow');
  }
};

export const toggleSidebar = () => {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const slideIn = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue('--SideNavigation-slideIn');
    if (slideIn) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }
};

export const formatPercent = (item: any, decimals=2) => {
  return `${(item * 100).toFixed(decimals)}%`
}

export const formatNumber = (item: any, decimals=2) => {
  return `${(item * 1).toFixed(decimals)}`
}


export const renderItem = (item: any, decimals = AMOUNT_DECIMALS) => {
  if (!item) {
    return ""
  } else if (item instanceof PublicKey) {
    return `${item.toString()}`
  } else if (item instanceof anchor.BN) {
    try {
      return `${(item.toNumber() / decimals).toFixed(3)}`
    } catch {
      return `${item.toString()}`
    }
  } else if (typeof item === 'number') {
    return `${(item / decimals).toFixed(3)}`
  } else {
    return `${item.toString()}`
  }
}

export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
};