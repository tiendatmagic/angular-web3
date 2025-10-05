import { Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Web3Service } from '../../services/web3.service';
import { initFlowbite } from 'flowbite';
import { combineLatest } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-header',
  standalone: false,
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit {
  account: string = '';
  balance: any;
  nativeSymbol: string = '';
  isConnected: boolean = false;
  selectedNetwork: string = '0xa4b1';
  selectedNetworkImg: string = '';
  selectedNetworkName: string = 'Arbitrum One';
  // dropdownOpen: boolean = false;
  networks: any;
  selectedExplorer: string = 'https://arbiscan.io';
  lang: string = 'vi';

  constructor(public web3Service: Web3Service, private snackBar: MatSnackBar, public translate: TranslateService) {
    this.web3Service.chainId$.subscribe((networkId: any) => {
      this.selectedNetwork = networkId;
      this.selectedNetworkImg = this.web3Service.chainConfig[this.selectedNetwork]?.logo || '';
      this.selectedNetworkName = this.web3Service.chainConfig[this.selectedNetwork]?.shortName || 'Unknown Network';
      this.selectedExplorer = this.web3Service.chainConfig[this.selectedNetwork]?.blockExplorerUrls;
    });
  }

  ngOnInit(): void {
    if (this.translate.currentLang == 'vi') {
      this.lang = 'vi';
    }
    else {
      this.lang = 'en';
    }

    this.networks = Object.keys(this.web3Service.chainConfig);

    this.selectedNetwork = this.web3Service.selectedChainId || this.networks[0];
    this.selectedNetworkImg = this.web3Service.chainConfig[this.selectedNetwork]?.logo || '';
    this.selectedNetworkName = this.web3Service.chainConfig[this.selectedNetwork]?.shortName || 'Unknown Network';

    combineLatest([
      this.web3Service.account$,
      this.web3Service.balance$,
      this.web3Service.nativeSymbol$,
      this.web3Service.isConnected$,
      this.web3Service.chainId$
    ]).subscribe(([account, balance, nativeSymbol, isConnected, chainId]) => {
      this.account = account;
      this.balance = balance;
      this.nativeSymbol = nativeSymbol;
      this.isConnected = isConnected;
      this.selectedNetwork = chainId;
    });

    initFlowbite();
  }

  connectWallet() {
    this.web3Service.connectWallet();
  }

  disconnectWallet() {
    this.web3Service.disconnectWallet();
  }

  onNetworkChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    this.selectedNetwork = selectElement.value;

    // Gọi phương thức switchNetwork từ Web3Service
    this.web3Service.switchNetwork(this.selectedNetwork)
      .then(() => {
        console.log(`Switched to network: ${this.selectedNetwork}`);
      })
      .catch((error) => {
        console.error('Error switching network:', error);
      });
  }

  toggleLanguage() {
    if (this.translate.currentLang == 'vi') {
      this.translate.use('en');
      localStorage.setItem("event-ticket-lang", 'en');
      this.lang = 'en';
    }
    else {
      this.translate.use('vi');
      localStorage.setItem("event-ticket-lang", 'vi');
      this.lang = 'vi';
    }
  }

  chooseNetwork(networkId: string) {
    this.web3Service.switchNetwork(networkId);
  }

  copyAddress(address: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(address).then(() => {
        console.log('Address copied to clipboard');
        this.snackBar.open('Address copied to clipboard', 'OK', {
          horizontalPosition: 'right',
          verticalPosition: 'bottom',
          duration: 3000
        });
      }).catch((error) => {
        console.error('Failed to copy address: ', error);
      });
    } else {
      let textArea = document.createElement("textarea");
      textArea.value = address;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (error) {
        console.error('Failed to copy address: ', error);
      }
      document.body.removeChild(textArea);
    }
  }
}
