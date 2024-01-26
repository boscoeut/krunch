import { PublicKey } from "@solana/web3.js";
import { AMOUNT_DECIMALS } from "utils/dist/constants";
import * as anchor from "@coral-xyz/anchor";
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import CurrencyExchangeRounded from '@mui/icons-material/CurrencyExchangeRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import QueryStatsRounded from '@mui/icons-material/QueryStatsRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import UpdateRounded from '@mui/icons-material/UpdateRounded';
import AutoModeRoundedIcon from '@mui/icons-material/AutoModeRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import CandlestickChartRoundedIcon from '@mui/icons-material/CandlestickChartRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeIcon from '@mui/icons-material/LightMode';
import MenuIcon from '@mui/icons-material/Menu';
import NorthIcon from '@mui/icons-material/North';
import SouthIcon from '@mui/icons-material/South';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import ArticleRoundedIcon from '@mui/icons-material/ArticleRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import GavelIcon from '@mui/icons-material/Gavel';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import WavesRoundedIcon from '@mui/icons-material/WavesRounded';
import PaidRoundedIcon from '@mui/icons-material/PaidRounded';
import DoubleArrowRoundedIcon from '@mui/icons-material/DoubleArrowRounded';
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded';
import HighlightOffRoundedIcon from '@mui/icons-material/HighlightOffRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import AttachMoneyRoundedIcon from '@mui/icons-material/AttachMoneyRounded';

export const ICONS = {
  YIELD: AttachMoneyRoundedIcon,
  DEPOSIT: AddCircleOutlineRoundedIcon,
  WITHDRAW: RemoveCircleOutlineRoundedIcon,
  WALLET: CurrencyExchangeRounded,
  REWARDS: EmojiEventsRounded,
  ARROW_DROP_DOWN: ArrowDropDown ,
  TRADE: QueryStatsRounded,
  REFRESH: RefreshRoundedIcon,
  SETTINGS: SettingsRoundedIcon,
  UPDATE_EXCHANGE: UpdateRounded,
  AUTO_REFRESH: AutoModeRoundedIcon,
  CONNECT:LinkRoundedIcon,
  MARKET: CandlestickChartRoundedIcon,
  DARK_MODE: DarkModeRoundedIcon,
  LIGHT_MODE: LightModeIcon,
  MENU: MenuIcon,
  NORTH: NorthIcon,
  SOUTH: SouthIcon,
  INFO: InfoOutlined,
  DOCUMENTATION: ArticleRoundedIcon,
  ACCOUNT: DashboardRoundedIcon,
  CONTRACTS: GavelIcon,
  HOME: HomeRoundedIcon,
  LOGIN: LoginRoundedIcon,
  LOGOUT: LogoutRoundedIcon,
  POOL: WavesRoundedIcon,
  MONEY: PaidRoundedIcon,
  DOUBLE_ARROW: DoubleArrowRoundedIcon,
  FILTER: FilterListRoundedIcon,
  CLOSE: HighlightOffRoundedIcon,
  CHECK: CheckRoundedIcon
}
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

export const formatPercent = (item: any, decimals = 2) => {
  return `${((item || 0) * 100).toFixed(decimals)}%`
}

export const formatNumber = (item: any, decimals = 2) => {
  return `${((item || 0) * 1).toFixed(decimals)}`
}


export const renderItem = (item: any, decimals = AMOUNT_DECIMALS, numDecimals = 3) => {
  if (!item) {
    return ""
  } else if (item instanceof PublicKey) {
    return `${item.toString()}`
  } else if (item instanceof anchor.BN) {
    try {
      return `${(item.toNumber() / decimals).toFixed(numDecimals)}`
    } catch {
      return `${item.toString()}`
    }
  } else if (typeof item === 'number') {
    return `${(item / decimals).toFixed(3)}`
  } else {
    return `${item.toString()}`
  }
}

export const formatCurrency = (amount: number, decimals:number=2, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number((amount || 0).toFixed(decimals)));
};

export const colors = {
  logoColor: '#37c437',
  dangerColor: 'red',
  toolbarBackground: "#131723",
  toolbarBorderColor: "#8c919763"
}