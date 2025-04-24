import { Component } from '@angular/core';
import { Web3Service } from '../../services/web3.service';

@Component({
  selector: 'app-main',
  standalone: false,
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss'
})
export class MainComponent {
  isConnected: boolean = false;
  constructor(public web3Service: Web3Service) {
    this.web3Service.isConnected$.subscribe((data: any) => {
      this.isConnected = data;
    });
  }
}
