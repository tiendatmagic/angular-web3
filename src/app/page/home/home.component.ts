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

  }

  test() {
    this.web3Service.checkInFunc(1);
  }
}
