import { Injectable, NgZone } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';
import { BrowserProvider, Contract, formatEther, JsonRpcProvider } from 'ethers';
import { NotifyModalComponent } from '../modal/notify-modal/notify-modal.component';
import EventTicketABI from '../../assets/abi/EventTicketABI.json';

declare let window: any;

@Injectable({ providedIn: 'root' })
export class Web3Service {
  private provider: BrowserProvider | JsonRpcProvider | null = null;
  private signer: any = null;
  private contract: any;

  private accountSubject = new BehaviorSubject<string>('');
  private balanceSubject = new BehaviorSubject<string>('0');
  private isConnectedSubject = new BehaviorSubject<boolean>(false);
  private chainIdSubject = new BehaviorSubject<string>('0xa4b1');
  private nativeSymbolSubject = new BehaviorSubject<string>('ETH');
  public isLoading$ = new BehaviorSubject<boolean>(false);

  account$ = this.accountSubject.asObservable();
  balance$ = this.balanceSubject.asObservable();
  isConnected$ = this.isConnectedSubject.asObservable();
  chainId$ = this.chainIdSubject.asObservable();
  nativeSymbol$ = this.nativeSymbolSubject.asObservable();

  selectedChainId = '0xa4b1';

  public chainConfig: Record<string, {
    symbol: string;
    name: string;
    logo: string;
    rpcUrls: string[];
    contractAddress: string;
    abi: any;
    blockExplorerUrls?: string[];
  }> = {
      '0xa4b1': {
        symbol: 'ETH',
        name: 'Arbitrum One',
        logo: '/assets/images/logo/arb.png',
        rpcUrls: ['https://arb1.arbitrum.io/rpc'],
        contractAddress: '0x718a71aaa7501593ec2bdf2f7bc87aaafdabde15',
        abi: EventTicketABI,
        blockExplorerUrls: ['https://arbiscan.io'],
      },
      '0xa': {
        symbol: 'ETH',
        name: 'Optimism',
        logo: '/assets/images/logo/op.png',
        rpcUrls: ['https://mainnet.optimism.io'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: EventTicketABI,
        blockExplorerUrls: ['https://optimistic.etherscan.io'],
      },
      '0x89': {
        symbol: 'POL',
        name: 'Polygon',
        logo: '/assets/images/logo/pol.png',
        rpcUrls: ['https://polygon-rpc.com'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: EventTicketABI,
        blockExplorerUrls: ['https://polygonscan.com'],
      },
      '0x7b7': {
        symbol: 'ONUS',
        name: 'ONUS',
        logo: '/assets/images/logo/onus.png',
        rpcUrls: ['https://rpc.onuschain.io'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: EventTicketABI,
      },
      '0x61': {
        symbol: 'BNB',
        name: 'BSC Testnet',
        logo: '/assets/images/logo/bnb.png',
        rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: EventTicketABI,
        blockExplorerUrls: ['https://testnet.bscscan.com'],
      },
    };

  constructor(private ngZone: NgZone, public dialog: MatDialog) {
    this.initEthers();
  }

  private async initEthers() {
    this.selectedChainId = localStorage.getItem('selectedChainId') || '0xa4b1';
    await this.refreshConnection();

    if (typeof window.ethereum !== 'undefined') {
      this.listenWalletEvents();
      const accounts = await this.provider!.send('eth_accounts', []);
      if (accounts.length > 0) {
        await this.setAccount(accounts[0]);
      }
    } else {
      console.warn('MetaMask is not installed, using RPC provider.');
    }
  }

  private listenWalletEvents() {
    window.ethereum.on('accountsChanged', (accounts: string[]) => {
      this.ngZone.run(() => {
        accounts.length ? this.setAccount(accounts[0]) : this.disconnectWallet();
      });
    });

    window.ethereum.on('chainChanged', async (chainId: string) => {
      this.ngZone.run(async () => {
        const formatted = chainId.toLowerCase();
        if (!this.chainConfig[formatted]) {
          this.showModal('Warning', 'The network you selected is not supported. Please switch to a supported network.', 'error');
          this.disconnectWallet();
          return;
        }
        this.selectedChainId = formatted;
        localStorage.setItem('selectedChainId', formatted);
        await this.refreshConnection();
      });
    });
  }

  private async refreshConnection() {
    const chain = this.chainConfig[this.selectedChainId];
    if (!chain) return;

    this.chainIdSubject.next(this.selectedChainId);
    this.nativeSymbolSubject.next(chain.symbol);

    this.provider = typeof window.ethereum !== 'undefined'
      ? new BrowserProvider(window.ethereum)
      : new JsonRpcProvider(chain.rpcUrls[0]);

    this.contract = new Contract(chain.contractAddress, chain.abi, this.provider) as any;

    if (this.account) {
      await this.setAccount(this.account);
    }
  }

  private get account() {
    return this.accountSubject.value;
  }

  private async getSigner() {
    if (!this.signer && this.provider) {
      this.signer = await this.provider.getSigner();
    }
    return this.signer;
  }

  async connectWallet(): Promise<boolean> {
    if (typeof window.ethereum === 'undefined') {
      this.handleNoMetamask();
      return false;
    }
    try {
      await this.refreshConnection();
      const accounts = await this.provider!.send('eth_requestAccounts', []);
      if (!accounts.length) throw new Error('No account found');
      await this.setAccount(accounts[0]);
      await this.switchNetwork(this.selectedChainId);
      return true;
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
    this.contract = null;
    this.provider = null;
  }

  private async getBalance(account: string) {
    try {
      const balance = await this.provider!.getBalance(account);
      this.balanceSubject.next(formatEther(balance));
    } catch (e: any) {
      this.handleError(e, 'getBalance');
    }
  }

  async getTokenBalance(address: string) {
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

    if (typeof window.ethereum !== 'undefined') {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: formatted }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          const net = this.chainConfig[formatted];
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: formatted,
              chainName: net.name,
              nativeCurrency: { name: net.symbol, symbol: net.symbol, decimals: 18 },
              rpcUrls: net.rpcUrls,
              blockExplorerUrls: net.blockExplorerUrls || [],
            }],
          });
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: formatted }],
          });
        } else {
          throw switchError;
        }
      }
    }

    await this.refreshConnection();
  }

  private handleNoMetamask() {
    if (this.isMobile()) {
      window.location.href = `https://metamask.app.link/dapp/${window.location.href}`;
    } else {
      this.showModal('Error', 'MetaMask not installed!', 'error', true, true, true);
    }
  }

  private handleError(error: any, context: string) {
    console.error(`${context} failed:`, error);
    if (error.code === 4001) {
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
