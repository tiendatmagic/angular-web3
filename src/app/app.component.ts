import { Component } from '@angular/core';
import { initFlowbite } from 'flowbite';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: false,
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'angular_web3';

  constructor(public translate: TranslateService) { }
  ngOnInit(): void {
    var lang = localStorage.getItem('event-ticket-lang');

    if (lang) {
      this.translate.use(lang);
    }
    else {
      this.translate.use('vi');
    }
    initFlowbite();
  }
}
