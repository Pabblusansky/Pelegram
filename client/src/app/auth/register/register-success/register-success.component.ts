import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { interval } from 'rxjs';

@Component({
  selector: 'app-register-success',
  imports: [
    RouterModule
  ],
  templateUrl: './register-success.component.html',
  styleUrl: './register-success.component.scss'
})
export class RegisterSuccessComponent implements OnInit {
  countdown: number = 7 ;
  constructor(private router: Router) {}

  ngOnInit(): void {
    this.countdown -=1;
    const interval = setInterval(() => {
      this.countdown -= 1;
      if (this.countdown <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    setTimeout(() => {
      this.router.navigate(['/login']);
    }, 7000);
  }
}
