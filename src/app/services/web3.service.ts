import { Injectable, NgZone } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject } from 'rxjs';
import Web3 from 'web3';
import { NotifyModalComponent } from '../modal/notify-modal/notify-modal.component';
import EventTicketABI from '../../assets/abi/EventTicketABI.json';

declare let window: any;

@Injectable({
  providedIn: 'root',
})
export class Web3Service {
  private web3: Web3 | null = null;
  private accountSubject = new BehaviorSubject<string>('');
  private balanceSubject = new BehaviorSubject<string>('0');
  private isConnectedSubject = new BehaviorSubject<boolean>(false);
  private chainIdSubject = new BehaviorSubject<any>('');
  private nativeSymbolSubject = new BehaviorSubject<string>('ETH');
  private contract: any;

  selectedChainId: any;
  account$ = this.accountSubject.asObservable();
  balance$ = this.balanceSubject.asObservable();
  isConnected$ = this.isConnectedSubject.asObservable();
  chainId$ = this.chainIdSubject.asObservable();
  nativeSymbol$ = this.nativeSymbolSubject.asObservable();

  // Supported chains in the app
  public chainConfig: any = {
    '0xa4b1': { symbol: 'ETH', name: 'Arbitrum One', logo: '/assets/images/logo/arb.png', rpcUrls: ['https://arb1.arbitrum.io/rpc'], contractAddress: '0x0000000000000000000000000000000000000000', abi: EventTicketABI },
    '0xa': { symbol: 'ETH', name: 'Optimism', logo: '/assets/images/logo/op.png', rpcUrls: ['https://mainnet.optimism.io'], contractAddress: '0x0000000000000000000000000000000000000000', abi: EventTicketABI },
    '0x89': { symbol: 'POL', name: 'Polygon', logo: '/assets/images/logo/pol.png', rpcUrls: ['https://polygon-rpc.com'], contractAddress: '0x0000000000000000000000000000000000000000', abi: EventTicketABI },
    '0x7b7': { symbol: 'ONUS', name: 'ONUS', logo: '/assets/images/logo/onus.png', rpcUrls: ['https://rpc.onuschain.io'], contractAddress: '0x0000000000000000000000000000000000000000', abi: EventTicketABI },
    '0x61': { symbol: 'BNB', name: 'BSC Testnet', logo: '/assets/images/logo/bnb.png', rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'], contractAddress: '0x0000000000000000000000000000000000000000', abi: EventTicketABI },
  };

  constructor(private ngZone: NgZone, public dialog: MatDialog) {
    this.setChainInfo();
    this.initWeb3();
  }

  // Initialize Web3 and set wallet state
  async initWeb3() {
    const savedChainId = localStorage.getItem('selectedChainId');
    this.selectedChainId = savedChainId || '0xa4b1'; // Default is Arbitrum
    if (typeof window.ethereum !== 'undefined') {
      this.web3 = new Web3(window.ethereum);

      try {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        if (!this.chainConfig[chainId]) {
          await this.switchNetwork('0xa4b1'); // Switch to Arbitrum if current chain is unsupported
        }

        const accounts = await this.web3.eth.getAccounts();
        if (accounts.length > 0) {
          this.ngZone.run(() => {
            this.setAccount(accounts[0]);
            this.setChainInfo();
          });
        }
      } catch (error) {
        console.error('Unable to auto-connect wallet or switch network:', error);
      }

      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          this.ngZone.run(() => this.setAccount(accounts[0]));
        } else {
          this.disconnectWallet();
        }
      });

      window.ethereum.on('chainChanged', async (chainId: string) => {
        const formattedChainId = chainId.toLowerCase();
        if (!this.chainConfig[chainId]) {
          console.warn(`User switched to an unsupported network: ${chainId}`);
          this.showModal(
            'Warning',
            'The network you selected is not currently supported. Please switch to a supported network.',
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

        await this.setChainInfo();
        const account = this.accountSubject.value;
        if (account) {
          await this.getBalance(account);
        }
      });

    } else {
      console.warn('MetaMask is not installed!');
    }
  }

  // Connect user wallet
  async connectWallet(): Promise<boolean> {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const account = accounts[0];

        this.web3 = new Web3(window.ethereum);
        await this.switchNetwork(this.selectedChainId);

        await this.setChainInfo();
        await this.setAccount(account);

        return true;
      } catch (error) {
        console.warn('Connection error:', error);
        return false;
      }
    } else {
      this.showModal('Error', 'MetaMask is not installed!', 'error', true, true, true);
      console.warn('MetaMask not found!');
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
    this.web3 = null;
  }

  // Get wallet balance
  private async getBalance(account: string) {
    if (this.web3) {
      const balanceInWei = await this.web3.eth.getBalance(account);
      const balance = this.web3.utils.fromWei(balanceInWei, 'ether');
      this.balanceSubject.next(balance);
    }
  }

  // Set network info
  private async setChainInfo() {
    let chainId = this.selectedChainId;

    if (window.ethereum && this.web3) {
      try {
        chainId = await window.ethereum.request({ method: 'eth_chainId' });
      } catch (err) {
        console.warn('Could not fetch chainId from MetaMask:', err);
      }
    }

    const chain = this.chainConfig[chainId] || this.chainConfig['0xa4b1']; // fallback về Arbitrum
    this.chainIdSubject.next(chainId || '0xa4b1');
    this.nativeSymbolSubject.next(chain.symbol);

    if (this.web3 && chain.contractAddress && chain.abi) {
      this.contract = new this.web3.eth.Contract(chain.abi, chain.contractAddress);
    }
  }

  // Switch wallet network
  async switchNetwork(chainId: string): Promise<void> {
    const formattedChainId = chainId.startsWith('0x') ? chainId.toLowerCase() : '0x' + parseInt(chainId).toString(16);
    try {
      const network = this.chainConfig[formattedChainId];
      if (!network) {
        throw new Error(`Chain ID ${formattedChainId} not found in chainConfig`);
      }

      const rpcUrls = network.rpcUrls || ['https://arb1.arbitrum.io/rpc'];

      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: formattedChainId }],
      });

      this.selectedChainId = formattedChainId;
      this.chainIdSubject.next(formattedChainId);

      await this.setChainInfo();
      const account = this.accountSubject.value;
      if (account) {
        await this.getBalance(account);
      }

      this.dialog.closeAll();
      localStorage.setItem('selectedChainId', this.selectedChainId);

    } catch (switchError: any) {
      if (switchError.code === 4902) {
        const network = this.chainConfig[formattedChainId];
        if (!network) {
          throw new Error(`Chain ID ${formattedChainId} not found in chainConfig`);
        }

        const chainParams = {
          chainId: formattedChainId,
          chainName: network.name,
          nativeCurrency: {
            name: 'Ether',
            symbol: network.symbol,
            decimals: 18,
          },
          rpcUrls: network.rpcUrls || ['https://default.rpc.url'],
          blockExplorerUrls: network.blockExplorerUrls || ['https://default.explorer.url'],
        };

        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [chainParams],
        });

        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: formattedChainId }],
        });
      } else {
        this.dialog.closeAll();
        throw switchError;
      }
    }
  }

  async getBalanceFunc(address: string = '') {
    if (!this.contract) {
      return;
    }

    try {
      const balance: any = await this.contract.methods.balanceOf(address).call();
      console.log('Balance:', balance.toString());
      return balance.toString();
    } catch (error) {
      console.error('Failed to get token balance:', error);
      return 0;
    }
  }

  async checkInFunc(tokenId: number): Promise<void> {
    if (!this.contract) {
      this.showModal('Error', 'Contract not initialized or Web3 not available.', 'error');
      return;
    }

    try {
      await this.contract.methods.checkIn(tokenId).send({ from: this.accountSubject.value });
      this.showModal('Success', `Checked in successfully with token ID ${tokenId}.`, 'success');
    } catch (error) {
      console.error('Check-in failed:', error);
      this.showModal('Error', 'Check-in failed. Please try again.', 'error');
    }
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
        installMetamask: installMetamask
      }
    });
  }
}
