import { Injectable, NgZone } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';
import { BrowserProvider, Contract, formatEther, JsonRpcProvider } from 'ethers';
import { NotifyModalComponent } from '../modal/notify-modal/notify-modal.component';
import EventTicketABI from '../../assets/abi/EventTicketABI.json';

interface EventTicketContract extends Contract {
  [key: string]: any;
  balanceOf(address: string): Promise<bigint>;
  checkIn(tokenId: number): Promise<any>;
}

declare let window: any;

@Injectable({
  providedIn: 'root',
})
export class Web3Service {
  private provider: BrowserProvider | JsonRpcProvider | null = null;
  private signer: any = null;
  private accountSubject = new BehaviorSubject<string>('');
  private balanceSubject = new BehaviorSubject<string>('0');
  private isConnectedSubject = new BehaviorSubject<boolean>(false);
  private chainIdSubject = new BehaviorSubject<string>('');
  private nativeSymbolSubject = new BehaviorSubject<string>('ETH');
  public isLoading$ = new BehaviorSubject<boolean>(false);
  private contract: EventTicketContract | null = null;

  selectedChainId: string;
  account$ = this.accountSubject.asObservable();
  balance$ = this.balanceSubject.asObservable();
  isConnected$ = this.isConnectedSubject.asObservable();
  chainId$ = this.chainIdSubject.asObservable();
  nativeSymbol$ = this.nativeSymbolSubject.asObservable();

  // Supported chains in the app
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
        blockExplorerUrls: ['https://arbiscan.io']
      },
      '0xa': {
        symbol: 'ETH',
        name: 'Optimism',
        logo: '/assets/images/logo/op.png',
        rpcUrls: ['https://mainnet.optimism.io'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: EventTicketABI,
        blockExplorerUrls: ['https://optimistic.etherscan.io']
      },
      '0x89': {
        symbol: 'POL',
        name: 'Polygon',
        logo: '/assets/images/logo/pol.png',
        rpcUrls: ['https://polygon-rpc.com'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: EventTicketABI,
        blockExplorerUrls: ['https://polygonscan.com']
      },
      '0x7b7': {
        symbol: 'ONUS',
        name: 'ONUS',
        logo: '/assets/images/logo/onus.png',
        rpcUrls: ['https://rpc.onuschain.io'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: EventTicketABI
      },
      '0x61': {
        symbol: 'BNB',
        name: 'BSC Testnet',
        logo: '/assets/images/logo/bnb.png',
        rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
        contractAddress: '0x0000000000000000000000000000000000000000',
        abi: EventTicketABI,
        blockExplorerUrls: ['https://testnet.bscscan.com']
      },
    };

  constructor(private ngZone: NgZone, public dialog: MatDialog) {
    this.selectedChainId = ''; // Initialize to avoid undefined
    this.initEthers();
  }

  // Initialize Ethers with default RPC or MetaMask
  async initEthers() {
    const savedChainId = localStorage.getItem('selectedChainId');
    this.selectedChainId = savedChainId || '0xa4b1'; // Default is Arbitrum
    await this.setChainInfo();

    if (typeof window.ethereum !== 'undefined') {
      await this.initializeProvider();
      try {
        const network = await this.provider!.getNetwork();
        const chainId = `0x${network.chainId.toString(16)} `;
        if (!this.chainConfig[chainId]) {
          await this.switchNetwork('0xa4b1'); // Switch to Arbitrum if unsupported
        }

        const accounts = await this.provider!.send('eth_accounts', []);
        if (accounts.length > 0) {
          this.ngZone.run(() => {
            this.setAccount(accounts[0]);
          });
        }
      } catch (error: any) {
        console.error('Unable to auto-connect wallet:', error);
        if (error.code === 'NETWORK_ERROR') {
          this.showModal('Error', 'Network changed unexpectedly. Please refresh and try again.', 'error', true, true);
        }
      }

      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        this.ngZone.run(() => {
          if (accounts.length > 0) {
            this.setAccount(accounts[0]);
          } else {
            this.disconnectWallet();
          }
        });
      });

      window.ethereum.on('chainChanged', async (chainId: string) => {
        this.ngZone.run(async () => {
          const formattedChainId = chainId.toLowerCase();
          if (!this.chainConfig[formattedChainId]) {
            this.showModal(
              'Warning',
              'The network you selected is not supported. Please switch to a supported network.',
              'error',
              true,
              true
            );
            this.disconnectWallet();
            return;
          }

          this.selectedChainId = formattedChainId;
          this.chainIdSubject.next(formattedChainId);
          localStorage.setItem('selectedChainId', formattedChainId);
          await this.initializeProvider(); // Reinitialize provider on chain change
          await this.setChainInfo();

          const account = this.accountSubject.value;
          if (account) {
            await this.getBalance(account);
          }
        });
      });
    } else {
      console.warn('MetaMask is not installed, using RPC provider.');
    }
  }

  // Initialize or reinitialize provider
  private async initializeProvider() {
    if (typeof window.ethereum !== 'undefined') {
      this.provider = new BrowserProvider(window.ethereum);
      if (this.accountSubject.value) {
        this.signer = await this.provider.getSigner();
      }
    }
  }

  isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  // Connect user wallet
  async connectWallet(): Promise<boolean> {
    if (typeof window.ethereum !== 'undefined') {
      try {
        await this.initializeProvider();
        const accounts = await this.provider!.send('eth_requestAccounts', []);
        const account = accounts[0];
        this.signer = await this.provider!.getSigner();
        await this.switchNetwork(this.selectedChainId);
        await this.setAccount(account);
        return true;
      } catch (error: any) {
        console.warn('Connection error:', error);
        if (error.code === 'NETWORK_ERROR') {
          this.showModal('Error', 'Network changed during connection. Please try again.', 'error', true, true);
        }
        return false;
      }
    } else {
      if (this.isMobile()) {
        const dappUrl = window.location.href;
        window.location.href = `https://metamask.app.link/dapp/${dappUrl}`;
        return false;
      }
      this.showModal('Error', 'MetaMask is not installed!', 'error', true, true, true);
      return false;
    }
  }

  private async setAccount(account: string) {
    this.accountSubject.next(account);
    this.isConnectedSubject.next(true);
    await this.getBalance(account);
  }

  // Disconnect wallet
  disconnectWallet() {
    this.accountSubject.next('');
    this.balanceSubject.next('0');
    this.isConnectedSubject.next(false);
    this.signer = null;
    this.contract = null;
    this.provider = null;
  }

  // Get wallet balance
  private async getBalance(account: string) {
    if (this.provider && account) {
      try {
        const balance = await this.provider.getBalance(account);
        const balanceInEther = formatEther(balance);
        this.balanceSubject.next(balanceInEther);
      } catch (error: any) {
        console.error('Failed to get balance:', error);
        if (error.code === 'NETWORK_ERROR') {
          this.showModal('Error', 'Network changed unexpectedly. Please try again.', 'error', true, true);
        }
      }
    }
  }

  // Set network info with RPC provider
  private async setChainInfo() {
    const chainId = this.selectedChainId;
    const chain = this.chainConfig[chainId] || this.chainConfig['0xa4b1']; // Fallback to Arbitrum
    this.chainIdSubject.next(chainId || '0xa4b1');
    this.nativeSymbolSubject.next(chain.symbol);

    // Initialize provider with RPC if no MetaMask
    if (!this.provider || !window.ethereum) {
      this.provider = new JsonRpcProvider(chain.rpcUrls[0]);
    }

    if (this.provider && chain.contractAddress && chain.abi) {
      this.contract = new Contract(chain.contractAddress, chain.abi, this.provider) as EventTicketContract;
    }
  }

  // Switch network (for app, not wallet)
  async switchNetwork(chainId: string): Promise<void> {
    const formattedChainId = chainId.startsWith('0x') ? chainId.toLowerCase() : '0x' + parseInt(chainId).toString(16);
    if (!this.chainConfig[formattedChainId]) {
      throw new Error(`Chain ID ${formattedChainId} not found in chainConfig`);
    }

    this.selectedChainId = formattedChainId;
    this.chainIdSubject.next(formattedChainId);
    localStorage.setItem('selectedChainId', formattedChainId);

    // If MetaMask is available, try switching wallet network
    if (typeof window.ethereum !== 'undefined') {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: formattedChainId }],
        });
        await this.initializeProvider(); // Reinitialize provider after network switch
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          const network = this.chainConfig[formattedChainId];
          const chainParams = {
            chainId: formattedChainId,
            chainName: network.name,
            nativeCurrency: {
              name: 'Ether',
              symbol: network.symbol,
              decimals: 18,
            },
            rpcUrls: network.rpcUrls,
            blockExplorerUrls: network.blockExplorerUrls || [],
          };

          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [chainParams],
          });

          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: formattedChainId }],
          });
          await this.initializeProvider(); // Reinitialize provider after adding network
        } else {
          throw switchError;
        }
      }
    }

    // Update provider and contract
    await this.setChainInfo();

    const account = this.accountSubject.value;
    if (account) {
      await this.getBalance(account);
    }
  }

  async getBalanceFunc(address: string = '') {
    await this.setChainInfo();
    if (!this.contract || !this.provider) {
      return;
    }

    try {
      const balance = await this.contract.balanceOf(address);
      console.log('Balance:', balance.toString());
      return balance.toString();
    } catch (error: any) {
      console.error('Failed to get token balance:', error);
      if (error.code === 'NETWORK_ERROR') {
        this.showModal('Error', 'Network changed unexpectedly. Please try again.', 'error', true, true);
      }
      return 0;
    }
  }

  async checkInFunc(tokenId: number): Promise<void> {
    if (this.isLoading$.value) return;
    await this.setChainInfo();

    if (!this.contract || !this.provider || !this.signer) {
      this.showModal('Error', 'Contract not initialized or provider/signer not available.', 'error');
      return;
    }
    if (!this.accountSubject.value || !tokenId) {
      this.showModal('Error', 'Please connect your wallet first.', 'error');
      return;
    }
    this.isLoading$.next(true);
    try {
      const contractWithSigner = this.contract.connect(this.signer) as EventTicketContract;
      const tx = await contractWithSigner.checkIn(tokenId);
      const receipt = await tx.wait();
      const transactionHash = receipt.transactionHash;
    } catch (error: any) {
      console.error('Check-in failed:', error);
      if (error.code === 'NETWORK_ERROR') {
        this.showModal('Error', 'Network changed during transaction. Please try again.', 'error', true, true);
      } else {
        this.showModal('Error', 'Check-in failed. Please try again.', 'error');
      }
    } finally {
      this.isLoading$.next(false);
    }
    await this.setAccount(this.accountSubject.value);
  }

  // Show notification modal
  showModal(title: string, message: string, status: string, showCloseBtn: boolean = true, disableClose: boolean = true, installMetamask: boolean = false) {
    this.dialog.closeAll();
    this.dialog.open(NotifyModalComponent, {
      disableClose: disableClose,
      width: '90%',
      maxWidth: '400px',
      data: {
        title: title,
        message: message,
        status: status,
        showCloseBtn: showCloseBtn,
        installMetamask: installMetamask,
      },
    });
  }
}