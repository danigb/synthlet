export const PROCESSOR = `"use strict";(()=>{function Q(q){let m=0,M=0,e=[0,0],t=[0,0],r=[0,0],l=[0,0],n=Math.min(192e3,Math.max(1,q)),f=6.2831855/n,u=6/n,w=2/n;return{update:b,process:T};function b(a,s){m=a,M=s}function T(a,s){let h=m,o=Math.tan(f*Math.pow(10,u*h+1)),c=o+1,p=o/c,S=o*o,i=o*(1-.25*p)+1,y=c*i,g=.25*(S/y)+1,R=o/i,d=o*(1-.25*R)+1,x=i*d,A=.25*(S/x)+1,F=o/d,C=.5*F,H=o*(1-C)+1,D=17-9.7*Math.pow(w*h,10),P=24.293*M+-.00010678119,I=(.5*(S/(d*H))+1)/(.0051455377*(o*o*o*o*D*P/(y*d*H))+1),Y=D*P/c,Z=.02058215*R,_=.5*p,$=.02058215*F,ee=.5*R,te=.0051455377*(o*o*o/(x*H)),le=1/d,oe=.5*(o/H),fe=1/i,re=1/c,O=2*p;for(let v=0;v<a.length;v++){let K=Math.max(-1,Math.min(1,100*a[v])),G=_*e[1]+t[1],U=ee*G,E=U+r[1],W=F*E+l[1],j=I*(1.5*K*(1-.33333334*(K*K))-Y*(.0411643*e[1]+Z*G+$*E+te*W))+le*(E+oe*W)-l[1],z=.5*(A*(l[1]+p*j)+fe*(G+C*E))-r[1],B=.5*(g*(r[1]+p*z)+re*(e[1]+U))-t[1],J=.5*(t[1]+p*B)-e[1],ne=e[1]+p*J;e[0]=e[1]+O*J,t[0]=t[1]+O*B,r[0]=r[1]+O*z,l[0]=l[1]+O*j,s[v]=ne,e[1]=e[0],t[1]=t[0],r[1]=r[0],l[1]=l[0]}}}function L(q,m){let M=0,e=0,t=0,r=0,l=0,n=0,f=[0,0],u=[0,0],w=[0,0];return e=Math.min(192e3,Math.max(1,q)),t=6.2831855/e,r=6/e,{update:T,process:m===1?s:a};function T(h,o){l=h,n=o}function a(h,o){let c=Math.tan(t*Math.pow(10,r*l+1)),p=c+1,S=c/p,i=9.293*n+-.00010678119,y=1-S,g=1/(1-.21521823*(c*i*y/p)),R=1/p,d=.21521823*i*y,x=2*S,A=.21521823*i;for(let F=0;F<h.length;F++){let C=h[F]-w[1],H=g*(w[1]+R*(c*C+d*f[1]-u[1]))-f[1],D=f[1]+S*H,P=D;f[0]=f[1]+x*H,u[0]=u[1]+x*(A*D-u[1]),w[0]=w[1]+x*C,o[F]=P,f[1]=f[0],u[1]=u[0],w[1]=w[0]}}function s(h,o){let c=Math.tan(t*Math.pow(10,r*l+1)),p=9.293*n+-.00010678119,S=c+1,i=c/S,y=1-.21521823*(c*p*(1-i)/S),g=1/y,R=1/S,d=2*i,x=.21521823*(p/y);for(let A=0;A<h.length;A++){let F=h[A],C=F-w[1],H=F-(w[1]+R*(c*C-f[1]+i*u[1])),D=g*H,P=x*H,I=P-u[1];f[0]=f[1]+d*(P-(i*I+f[1]+u[1])),u[0]=u[1]+d*I,w[0]=w[1]+d*C,o[A]=D,f[1]=f[0],u[1]=u[0],w[1]=w[0]}}}function V(q){let m=0,M=0,e=[0,0],t=[0,0],r=[0,0],l=[0,0],n=3.1415927/Math.min(192e3,Math.max(1,q));return{update:f,process:u};function f(w,b){m=w,M=b}function u(w,b){let T=Math.tan(n*m),a=T+1,s=T/a,h=24.293*M+-.00010678119,o=.1646572*h*(1-s),c=1/(.1646572*(T*T*T*T*h/(a*a*a*a))+1),p=2*s;for(let S=0;S<w.length;S++){let i=c*(w[S]-o*(l[1]+s*(r[1]+s*(t[1]+s*e[1]))))-e[1];e[0]=e[1]+p*i;let y=e[1]+s*i-t[1];t[0]=t[1]+p*y;let g=t[1]+s*y-r[1];r[0]=r[1]+p*g;let R=r[1]+s*g-l[1];l[0]=l[1]+p*R;let d=l[1]+s*R;b[S]=d,e[1]=e[0],t[1]=t[0],r[1]=r[0],l[1]=l[0]}}}function X(q){let m=0,M=0,e=0,t=0,r=0,l=[0,0],n=[0,0],f=[0,0];return M=Math.min(192e3,Math.max(1,q)),e=6/M,t=6.2831855/M,{update:u,process:w};function u(b,T){m=b,r=T}function w(b,T){let a=Math.tan(t*Math.pow(10,e*m+1)),s=a+1,h=a/s,o=2*h,c=o+-1,p=.0823286*(a*c/s),S=.0823286*c,i=24.293*r+-.00010678119,y=i/s,g=1/(.0823286*(a*a*i*c/(s*s))+1);for(let R=0;R<b.length;R++){let d=g*(b[R]-y*(.1646572*l[1]+S*n[1]+p*f[1]))-f[1],x=f[1]+h*d-n[1],A=n[1]+h*x,F=A-l[1];l[0]=l[1]+o*F,n[0]=n[1]+o*x,f[0]=f[1]+o*d;let C=2*(l[1]+h*F)-A;T[R]=C,l[1]=l[0],n[1]=n[0],f[1]=f[0]}}}function k(q,m){let M=0,e=0,t=0,r=0,l=0,n=[0,0],f=[0,0];return M=Math.min(192e3,Math.max(1,q)),e=6.2831855/M,t=6/M,m=m,{update:u,process:w};function u(b,T){r=b,l=T}function w(b,T){let a=Math.tan(e*Math.pow(10,t*r+1)),s=1/(29.293*l+.707)+a,h=a*s+1,o=a/h,c=1/h,p=2*a;for(let S=0;S<b.length;S++){let i=b[0]-(n[1]+s*f[1]),y=o*i,g=Math.max(-1,Math.min(1,f[1]+y)),R=g*(1-.33333334*(g*g)),d=a*R,x=n[1]+d,A=c*i,F=A,C=R,H=d+n[1]+A;n[0]=n[1]+p*R,f[0]=y+R,T[S]=m==1?F:m==2?C:m==3?H:x,n[1]=n[0],f[1]=f[0]}}}var N=class extends AudioWorkletProcessor{r;t;p;d;constructor(){super(),this.r=!0,this.p=[V(sampleRate),X(sampleRate),L(sampleRate,0),L(sampleRate,1),Q(sampleRate),k(sampleRate,0),k(sampleRate,1),k(sampleRate,2),k(sampleRate,3)],this.t=0,this.d=this.p[0],this.port.onmessage=m=>{switch(m.data.type){case"DISPOSE":this.r=!1;break}}}process(m,M,e){let t=Math.floor(e.type);if(this.t!==t&&(this.t=t,this.d=this.p[t]||this.p[0],console.log("USING FILTER",t,this.d)),m[0].length===0)return this.r;let r=e.detune[0],l=e.frequency[0];return this.d.update(l*(r?Math.pow(2,e.detune[0]/12):1),e.resonance[0]),this.d.process(m[0][0],M[0][0]),this.r}static get parameterDescriptors(){return[["type",0,0,8],["frequency",1e3,20,2e4],["detune",0,-127,127],["resonance",.8,0,1]].map(([m,M,e,t])=>({name:m,defaultValue:M,minValue:e,maxValue:t,automationRate:"k-rate"}))}};registerProcessor("VAFProcessor",N);})();`;