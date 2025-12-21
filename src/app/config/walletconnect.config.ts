export const WALLETCONNECT_PROJECT_ID: string = '172bc32faa1c546281d070d8f71f1440';

export const WALLETCONNECT_METADATA = {
  name: 'Event Ticket',
  description: 'Event Ticket dApp',
  url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  icons: [
    typeof window !== 'undefined'
      ? `${window.location.origin}/assets/images/logo.png`
      : 'http://localhost/assets/images/logo.png',
  ],
};
