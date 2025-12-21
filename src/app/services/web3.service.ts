import { Injectable, NgZone } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';
import { BrowserProvider, Contract, formatEther, JsonRpcProvider } from 'ethers';
import { NotifyModalComponent } from '../modal/notify-modal/notify-modal.component';
import StudentABI from '../../assets/abi/StudentABI.json';
import EthereumProvider from '@walletconnect/ethereum-provider';
import { WALLETCONNECT_METADATA, WALLETCONNECT_PROJECT_ID } from '../config/walletconnect.config';

declare let window: any;

@Injectable({ providedIn: 'root' })
export class Web3Service {
  private readProvider: JsonRpcProvider | null = null;
  private provider: BrowserProvider | null = null;
  private signer: any = null;
  private contract: any;

  private walletEip1193Provider: any = null;
  private walletProviderType: 'injected' | 'walletconnect' | null = null;
  private walletConnectProvider: any = null;

  private accountSubject = new BehaviorSubject<string>('');
  private balanceSubject = new BehaviorSubject<string>('0');
  private isConnectedSubject = new BehaviorSubject<boolean>(false);
  private chainIdSubject = new BehaviorSubject<string>('');
  private nativeSymbolSubject = new BehaviorSubject<string>('ETH');
  public isLoading$ = new BehaviorSubject<boolean>(false);

  private studentDataSubject = new BehaviorSubject<any>(null);
  public studentData$ = this.studentDataSubject.asObservable();
  get studentData(): any {
    return this.studentDataSubject.value;
  }
  set studentData(value: any) {
    this.studentDataSubject.next(value);
  }

  account$ = this.accountSubject.asObservable();
  balance$ = this.balanceSubject.asObservable();
  isConnected$ = this.isConnectedSubject.asObservable();
  chainId$ = this.chainIdSubject.asObservable();
  nativeSymbol$ = this.nativeSymbolSubject.asObservable();

  selectedChainId = '';

  public chainConfig: Record<string, {
    symbol: string;
    name: string;
    shortName: string;
    logo: string;
    rpcUrls: string[];
    contractAddress: string;
    abi: any;
    blockExplorerUrls?: any;
  }> = {
      '0x1': {
        symbol: 'ETH',
        name: 'Ethereum Mainnet',
        shortName: 'Ethereum',
        logo: '/assets/images/logo/eth.png',
        rpcUrls: ['https://eth.llamarpc.com'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: StudentABI,
        blockExplorerUrls: ['https://etherscan.io'],
      },
      '0xa4b1': {
        symbol: 'ETH',
        name: 'Arbitrum One',
        shortName: 'Arbitrum One',
        logo: '/assets/images/logo/arb.png',
        rpcUrls: ['https://arb1.arbitrum.io/rpc'],
        contractAddress: '0x718a71aaa7501593ec2bdf2f7bc87aaafdabde15',
        abi: StudentABI,
        blockExplorerUrls: ['https://arbiscan.io'],
      },
      '0xa': {
        symbol: 'ETH',
        name: 'Optimism',
        shortName: 'Optimism',
        logo: '/assets/images/logo/op.png',
        rpcUrls: ['https://mainnet.optimism.io'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: StudentABI,
        blockExplorerUrls: ['https://optimistic.etherscan.io'],
      },
      '0x89': {
        symbol: 'POL',
        name: 'Polygon',
        shortName: 'Polygon',
        logo: '/assets/images/logo/pol.png',
        rpcUrls: ['https://polygon-rpc.com'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: StudentABI,
        blockExplorerUrls: ['https://polygonscan.com'],
      },
      '0x7b7': {
        symbol: 'ONUS',
        name: 'ONUS',
        shortName: 'ONUS',
        logo: '/assets/images/logo/onus.png',
        rpcUrls: ['https://rpc.onuschain.io'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: StudentABI,
      },
      '0x38': {
        symbol: 'BNB',
        name: 'BNB Smart Chain',
        shortName: 'BSC',
        logo: '/assets/images/logo/bnb.png',
        rpcUrls: ['https://bsc-dataseed1.binance.org'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: StudentABI,
        blockExplorerUrls: ['https://bscscan.com'],
      },
      '0x61': {
        symbol: 'BNB',
        name: 'BSC Testnet',
        shortName: 'BSC Testnet',
        logo: '/assets/images/logo/bnb.png',
        rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
        contractAddress: '0x35613B592416CEc729DA3Dd8D06739D2757709fb',
        abi: StudentABI,
        blockExplorerUrls: ['https://testnet.bscscan.com'],
      },
    };

  constructor(private ngZone: NgZone, public dialog: MatDialog) {
    this.initEthers();
  }

  private getDefaultChainId(): string {
    const keys = Object.keys(this.chainConfig);
    return keys.length ? keys[0].toLowerCase() : '';
  }

  private async initEthers() {
    const savedChain = localStorage.getItem('selectedChainId') || this.getDefaultChainId();
    this.selectedChainId = savedChain.toLowerCase();

    await this.refreshConnection(true);

    // Restore the last used wallet silently (no UI popups).
    const lastProviderType = (localStorage.getItem('walletProviderType') || '') as any;

    if (lastProviderType === 'injected' && typeof window.ethereum !== 'undefined') {
      try {
        const ok = await this.connectInjected(true);
        if (ok) return;
      } catch {
        // ignore, will continue with read-only
      }
    }

    if (lastProviderType === 'walletconnect') {
      try {
        const ok = await this.connectWalletConnect(true);
        if (ok) return;
      } catch {
        // ignore, will continue with read-only
      }
    }

    console.warn('No wallet session found; staying in read-only mode.');
  }

  private shouldPreferBrowserWallet(): boolean {
    return !this.isMobile() && typeof window.ethereum !== 'undefined';
  }

  private listenWalletEventsInjected() {
    if (typeof window.ethereum === 'undefined') return;

    window.ethereum.on('accountsChanged', (accounts: string[]) => {
      this.ngZone.run(() => {
        accounts.length ? this.setAccount(accounts[0]) : this.disconnectWallet();
      });
    });

    window.ethereum.on('chainChanged', async (chainId: string) => {
      this.ngZone.run(async () => {
        await this.handleChainChanged(chainId);
      });
    });
  }

  private listenWalletEventsWalletConnect(provider: any) {
    if (!provider?.on) return;

    provider.on('accountsChanged', (accounts: string[]) => {
      this.ngZone.run(() => {
        accounts?.length ? this.setAccount(accounts[0]) : this.disconnectWallet();
      });
    });

    provider.on('chainChanged', (chainId: number | string) => {
      this.ngZone.run(async () => {
        await this.handleChainChanged(chainId);
      });
    });

    provider.on('disconnect', () => {
      this.ngZone.run(() => {
        this.disconnectWallet();
      });
    });
  }

  private async handleChainChanged(chainId: string | number) {
    const formatted = this.normalizeChainId(chainId);
    if (!formatted || !this.chainConfig[formatted]) {
      this.showModal(
        'Warning',
        'The network you selected is not supported. Please switch to a supported network.',
        'error'
      );
      this.disconnectWallet();
      localStorage.setItem('unsupportedNetwork', 'true');
      return;
    }

    localStorage.removeItem('unsupportedNetwork');
    this.selectedChainId = formatted;
    localStorage.setItem('selectedChainId', formatted);
    await this.refreshConnection();

    try {
      await this.getDataFunc(1);
    } catch (err) {
      console.error('Failed to reload data after network change:', err);
    }
  }

  private normalizeChainId(chainId: string | number): string {
    if (typeof chainId === 'number') return '0x' + chainId.toString(16).toLowerCase();
    const trimmed = `${chainId}`.trim().toLowerCase();
    if (trimmed.startsWith('0x')) return trimmed;
    const num = Number(trimmed);
    if (Number.isFinite(num) && num > 0) return '0x' + num.toString(16).toLowerCase();
    return '';
  }

  private async refreshConnection(readOnly: boolean = false) {
    const chain = this.chainConfig[this.selectedChainId];
    if (!chain) {
      console.error(`No chain config for chainId: ${this.selectedChainId}`);
      this.readProvider = null;
      this.contract = null;
      return;
    }

    this.chainIdSubject.next(this.selectedChainId);
    this.nativeSymbolSubject.next(chain.symbol);

    try {
      this.readProvider = new JsonRpcProvider(chain.rpcUrls[0]);
      this.contract = new Contract(chain.contractAddress, chain.abi, this.readProvider);
    } catch (e: any) {
      console.error('Failed to initialize readProvider or contract:', e.message);
    }

    if (!readOnly && this.account) {
      await this.setAccount(this.account);
    }
  }

  private get account() {
    return this.accountSubject.value;
  }

  private async getSigner() {
    if (!this.provider) {
      throw new Error('No wallet connected. Please connect your wallet.');
    }

    if (!this.signer) {
      this.signer = await this.provider.getSigner();
    }
    return this.signer;
  }

  private getWalletRequestProvider(): any {
    if (this.walletProviderType === 'walletconnect') return this.walletConnectProvider;
    if (this.walletProviderType === 'injected') return typeof window.ethereum !== 'undefined' ? window.ethereum : null;
    return null;
  }

  private getRpcMap(): Record<number, string> {
    const map: Record<number, string> = {};
    for (const chainIdHex of Object.keys(this.chainConfig)) {
      const chainIdNum = parseInt(chainIdHex, 16);
      const rpcUrl = this.chainConfig[chainIdHex]?.rpcUrls?.[0];
      if (chainIdNum && rpcUrl) map[chainIdNum] = rpcUrl;
    }
    return map;
  }

  private getAllSupportedChainIdsNumeric(): number[] {
    return Object.keys(this.chainConfig)
      .map((hex) => parseInt(hex, 16))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  private ensureWalletConnectConfigured(): boolean {
    const projectId = (WALLETCONNECT_PROJECT_ID || '').trim();
    if (!projectId || projectId === 'YOUR_WALLETCONNECT_PROJECT_ID') {
      this.showModal(
        'Error',
        'WalletConnect is not configured. Please set WALLETCONNECT_PROJECT_ID in src/app/config/walletconnect.config.ts',
        'error'
      );
      return false;
    }
    return true;
  }

  private async connectInjected(isAutoReconnect: boolean = false): Promise<boolean> {
    if (typeof window.ethereum === 'undefined') return false;

    this.walletProviderType = 'injected';
    localStorage.setItem('walletProviderType', 'injected');
    this.walletEip1193Provider = window.ethereum;
    this.provider = new BrowserProvider(this.walletEip1193Provider);
    this.listenWalletEventsInjected();

    try {
      const network = await this.provider.getNetwork();
      const actualChainId = '0x' + network.chainId.toString(16).toLowerCase();

      if (!this.chainConfig[actualChainId]) {
        console.warn('Network not supported. Wallet will not connect.');
        this.disconnectWallet();
        localStorage.setItem('unsupportedNetwork', 'true');
        this.selectedChainId = this.getDefaultChainId();
        await this.refreshConnection(true);
        return false;
      }

      localStorage.removeItem('unsupportedNetwork');
      this.selectedChainId = actualChainId;
      localStorage.setItem('selectedChainId', actualChainId);
      await this.refreshConnection(false);
    } catch {
      await this.refreshConnection(true);
    }

    try {
      const method = isAutoReconnect ? 'eth_accounts' : 'eth_requestAccounts';
      const accounts = await this.provider.send(method, []);
      if (accounts?.length > 0 && !localStorage.getItem('unsupportedNetwork')) {
        await this.setAccount(accounts[0]);
        return true;
      }
      return false;
    } catch (e: any) {
      if (!isAutoReconnect) this.handleError(e, 'connectInjected');
      return false;
    }
  }

  private async connectWalletConnect(isAutoReconnect: boolean = false): Promise<boolean> {
    if (!this.ensureWalletConnectConfigured()) return false;

    const selectedChainNum = parseInt(this.selectedChainId, 16) || 1;
    const optionalChains = this.getAllSupportedChainIdsNumeric();
    const rpcMap = this.getRpcMap();

    this.walletConnectProvider = await EthereumProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [selectedChainNum],
      optionalChains,
      rpcMap,
      showQrModal: !isAutoReconnect,
      qrModalOptions: {
        enableExplorer: true,
      },
      metadata: WALLETCONNECT_METADATA,
    });

    this.listenWalletEventsWalletConnect(this.walletConnectProvider);

    try {
      const accounts: string[] = isAutoReconnect
        ? (this.walletConnectProvider?.accounts ??
          (await this.walletConnectProvider?.request?.({ method: 'eth_accounts' })) ??
          [])
        : await this.walletConnectProvider.enable();

      if (!accounts?.length) {
        if (!isAutoReconnect) {
          this.showModal('Error', 'No accounts returned from WalletConnect.', 'error');
        }
        try {
          await this.walletConnectProvider?.disconnect?.();
        } catch {
          // ignore
        }
        this.walletConnectProvider = null;
        this.walletEip1193Provider = null;
        this.walletProviderType = null;
        localStorage.removeItem('walletProviderType');
        return false;
      }

      this.walletProviderType = 'walletconnect';
      localStorage.setItem('walletProviderType', 'walletconnect');
      this.walletEip1193Provider = this.walletConnectProvider;
      this.provider = new BrowserProvider(this.walletConnectProvider);

      const network = await this.provider.getNetwork();
      const actualChainId = '0x' + network.chainId.toString(16).toLowerCase();

      if (!this.chainConfig[actualChainId]) {
        console.warn('Network not supported. Wallet will not connect.');
        this.disconnectWallet();
        localStorage.setItem('unsupportedNetwork', 'true');
        this.selectedChainId = this.getDefaultChainId();
        await this.refreshConnection(true);
        return false;
      }

      localStorage.removeItem('unsupportedNetwork');
      this.selectedChainId = actualChainId;
      localStorage.setItem('selectedChainId', actualChainId);
      await this.refreshConnection(false);

      if (accounts?.length) {
        await this.setAccount(accounts[0]);
        return true;
      }

      return false;
    } catch (e: any) {
      if (!isAutoReconnect) this.handleError(e, 'connectWalletConnect');
      return false;
    }
  }

  async connectWallet(): Promise<boolean> {
    try {
      // Desktop UX: prefer Browser Wallet (MetaMask, etc.) to avoid showing QR/modal.
      if (this.shouldPreferBrowserWallet()) {
        const ok = await this.connectInjected(false);
        if (ok) return true;
      }

      // Mobile / no injected: use WalletConnect.
      return await this.connectWalletConnect(false);
    } catch (e: any) {
      this.handleError(e, 'connectWallet');
      return false;
    }
  }

  private async setAccount(account: string) {
    this.accountSubject.next(account);
    this.isConnectedSubject.next(true);
    await this.getBalance(account);
  }

  disconnectWallet() {
    this.accountSubject.next('');
    this.balanceSubject.next('0');
    this.isConnectedSubject.next(false);
    this.signer = null;
    this.provider = null;

    if (this.walletProviderType === 'walletconnect') {
      const p = this.walletConnectProvider;
      this.walletConnectProvider = null;
      this.walletEip1193Provider = null;
      this.walletProviderType = null;
      try {
        void p?.disconnect?.();
      } catch {
        // ignore
      }
      return;
    }

    this.walletEip1193Provider = null;
    this.walletProviderType = null;
  }

  private async getBalance(account: string) {
    try {
      if (!this.readProvider) {
        throw new Error('readProvider is not initialized');
      }
      const balance = await this.readProvider.getBalance(account);
      this.balanceSubject.next(formatEther(balance));
    } catch (e: any) {
      console.error(`Error in getBalance for account ${account}:`, e.message);
      this.handleError(e, 'getBalance');
    }
  }

  async getTokenBalanceFunc(address: string) {
    try {
      return (await this.contract?.balanceOf(address))?.toString() ?? '0';
    } catch (e: any) {
      this.handleError(e, 'getTokenBalance');
      return '0';
    }
  }

  async checkInFunc(tokenId: number) {
    if (!tokenId) return this.showModal('Error', 'Invalid tokenId', 'error');
    if (this.isLoading$.value) return;

    try {
      this.isLoading$.next(true);
      const signer = await this.getSigner();
      const tx = await this.contract!.connect(signer).checkIn(tokenId);
      const receipt = await tx.wait();
      this.showModal('Success', `Check-in successful! Tx: ${receipt.hash}`, 'success');
    } catch (e: any) {
      this.handleError(e, 'checkIn');
    } finally {
      this.isLoading$.next(false);
    }
  }

  async switchNetwork(chainId: string): Promise<void> {
    const formatted = chainId.startsWith('0x') ? chainId.toLowerCase() : '0x' + parseInt(chainId).toString(16);
    if (!this.chainConfig[formatted]) throw new Error(`Chain ID ${formatted} not supported`);

    this.selectedChainId = formatted;
    this.chainIdSubject.next(formatted);
    localStorage.setItem('selectedChainId', formatted);
    await this.refreshConnection();
    try {
      const data = await this.getDataFunc(1);
    } catch (err) {
      console.error('Failed to load data for chain', formatted, ':', err);
      this.showModal('Error', 'Failed to load data for the selected network.', 'error');
    }

    const walletProvider = this.getWalletRequestProvider();
    if (!walletProvider?.request) return;

    try {
      await walletProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: formatted }],
      });
    } catch (switchError: any) {
      if (switchError?.code === 4902) {
        const net = this.chainConfig[formatted];
        try {
          await walletProvider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: formatted,
              chainName: net.name,
              nativeCurrency: { name: net.symbol, symbol: net.symbol, decimals: 18 },
              rpcUrls: net.rpcUrls,
              blockExplorerUrls: net.blockExplorerUrls || [],
            }],
          });
          await walletProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: formatted }],
          });
        } catch {
          console.warn('User rejected adding network, but read operations will use selected chain:', formatted);
          this.showModal(
            'Warning',
            'You rejected adding the network. Data has been loaded, but transactions may fail if the wallet network doesn’t match.',
            'error'
          );
        }
      } else {
        console.warn('Network switch failed, but read operations will use selected chain:', formatted);
      }
    }
  }

  private handleNoMetamask() {
    if (this.isMobile()) {
      // On mobile browsers (Chrome/Safari), the correct UX is WalletConnect.
      void this.connectWalletConnect(false);
      return;
    }
    this.showModal('Error', 'No injected wallet found. Please install MetaMask or use WalletConnect.', 'error', true, true, true);
  }

  private handleError(error: any, context: string) {
    if (error.code === 'ACTION_REJECTED') {
      this.showModal('Error', 'User rejected request.', 'error');
    } else if (error.code === 'NETWORK_ERROR') {
      this.showModal('Error', 'Network error. Please retry.', 'error');
    } else {
      this.showModal('Error', error.message || 'Unknown error', 'error');
    }
  }

  private isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  async getDataFunc(pageNumber: number = 1) {
    try {
      const data: any = await this.contract?.getAllStudents(pageNumber);
      this.studentData = data.map((item: any) => {
        return {
          id: Number(item[0]),
          studentId: item[1],
          fullName: item[2],
          dateOfBirth: Number(item[3]),
          gender: item[4],
          permanentAddress: item[5],
          creator: item[6],
        };
      });
      return data;
    } catch (e: any) {
      this.studentData = [];
      return [];
    }
  }

  async deleteFunc(studentId: number) {
    if (!studentId) return this.showModal('Error', 'Invalid studentId', 'error');
    if (this.isLoading$.value) return;

    try {
      this.isLoading$.next(true);
      const signer = await this.getSigner();
      const tx = await this.contract!.connect(signer).deleteStudent(studentId);
      const receipt = await tx.wait();
      this.showModal('Success', `Remove successful! Tx: ${receipt.hash}`, 'success');
    } catch (e: any) {
      this.handleError(e, 'deleteStudent');
    } finally {
      this.isLoading$.next(false);
    }
  }

  showModal(title: string, message: string, status: string,
    showCloseBtn = true, disableClose = true, installMetamask = false) {
    this.dialog.closeAll();
    this.dialog.open(NotifyModalComponent, {
      disableClose,
      width: '90%',
      maxWidth: '400px',
      data: { title, message, status, showCloseBtn, installMetamask },
    });
  }
}