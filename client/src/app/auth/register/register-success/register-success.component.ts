import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';


@Component({
  selector: 'app-register-success',
  imports: [
    RouterModule
  ],
  templateUrl: './register-success.component.html',
  styleUrl: './register-success.component.scss'
})
export class RegisterSuccessComponent implements OnInit {
  private router = inject(Router);

  countdown: number = 7 ;

  ngOnInit(): void {
    this.countdown -=1;
    const interval = setInterval(() => {
      this.countdown -= 1;
      if (this.countdown <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    setTimeout(() => {
      this.router.navigate(['/auth/login']);
    }, 7000);
  }
}
