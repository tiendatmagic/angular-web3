import { Component } from '@angular/core';
import { Web3Service } from '../../services/web3.service';

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {

  constructor(private web3Service: Web3Service) { }
  ngOnInit() {
    this.test();
  }

  test() {
    this.web3Service.getBalanceFunc('0x1AD11e0e96797a14336Bf474676EB0A332055555');
  }
}
