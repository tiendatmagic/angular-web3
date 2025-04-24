import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-notify-modal',
  standalone: false,
  templateUrl: './notify-modal.component.html',
  styleUrl: './notify-modal.component.scss'
})
export class NotifyModalComponent {
  datas: any = [];
  constructor(public dialogRef: MatDialogRef<NotifyModalComponent>, @Inject(MAT_DIALOG_DATA) public data: any) { }

  ngOnInit() {
    this.datas = this.data;
  }
  onNoClick() {
    this.dialogRef.close();
  }
}
