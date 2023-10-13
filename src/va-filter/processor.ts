export const PROCESSOR = `(()=>{function C(s){return Object.keys(s).map(e=>{let{min:r,max:c,init:o}=s[e];return{name:e,minValue:r,maxValue:c,defaultValue:o,automationRate:"k-rate"}})}var L=Math.PI,d=2*L,H=L*L;var v=4/L,D=-4/H;var l=5/12,x=Math.pow(10,-1/l),w=1/(1-x),V=1/(1+l*Math.log10(1+x)),I=1/(1+-Math.pow(10,-1/l)),W=l*Math.log10(1+x),E=1/(-l*Math.log10(x)+W);function m(s){let e=1/(2*s),r=0,c=0,o={a:0,b:1},t={LP:0,HP:0,AP:0,ALP:0};function i(a){if(a===r)return;r=a;let n=Math.tan(d*r*e);o.a=n/(1+n)}function u(a){let n=(a-c)*o.a;return t.LP=(a-c)*o.a+c,t.HP=a-t.LP,t.AP=t.LP-t.HP,t.ALP=t.LP+o.a*t.HP,c=n+t.LP,t}function P(){return c*o.b}return{coeff:o,process:u,update:i,fb:P}}function N(s){let e=1/(2*s),r=0,c=0,o={K:1,a:0,b:0,g:0},t=m(s),i=m(s),u=m(s),P=m(s),a=m(s),n=m(s),p={LP:0,HP:0,ALP:0};function A(b,f){b==r&&f==c||(r=b,o.K=c=f,o.g=Math.tan(d*r*e),o.a=o.g/(1+o.g),o.b=1/(1-o.K*o.a+o.K*o.a*o.a),t.coeff.a=i.coeff.a=u.coeff.a=o.a,P.coeff.a=a.coeff.a=n.coeff.a=o.a,i.coeff.b=o.K*(1-o.a)/(1+o.g),u.coeff.b=-1/(1+o.g),a.coeff.b=-o.a/(1+o.g),n.coeff.b=1/(1+o.g))}function h(b){let f=t.process(b),y=i.fb()+u.fb(),O=o.a*(f.ALP+y);if(f=i.process(O),p.LP=f.LP*o.K,p.ALP=f.ALP*o.K,u.process(p.LP),f=P.process(b),y=a.fb()+n.fb(),O=o.a*(f.HP+y),p.HP=O*o.K,f=a.process(p.HP),n.process(f.HP),o.K>0){let S=1/o.K;p.LP*=S,p.HP*=S,p.ALP*=S}return p}return{update:A,process:h}}function M(s){let e=0,r=0,c=1/(2*s),o={a:0,b:1,s:1,r:1},t={LP:0,HP:0,BP:0,BS:0,ALP:0},i=0,u=0;function P(n,p){if(n===e&&p===r)return;e=n,r=p,o.a=Math.tan(d*e*c);let A=1/(2*r);o.b=1/(1+2*A*o.a+o.a*o.a),r>24.9?o.r=o.a:o.r=2*A+o.a;let h=s/2/e;o.s=1/(o.a*h*h)}function a(n){return t.HP=o.b*(n-o.r*i-u),t.BP=o.a*t.HP+i,t.LP=o.a*t.BP+u,t.BS=t.HP+t.LP,t.ALP=t.LP+o.s*i,i=o.a*t.HP+t.BP,u=o.a*t.BP+t.LP,t}return{update:P,process:a,coeff:o}}var g={type:{min:0,max:14,init:1},frequency:{min:0,max:1e4,init:1e3},resonance:{min:0,max:1,init:.5}},k=class{constructor(e){this.sampleRate=e;this.filterType=0,this.va1=m(e),this.va2=M(e),this.korg35=N(e),this.process=r=>r,this.processors=[r=>r,r=>this.va1.process(r).LP,r=>this.va1.process(r).HP,r=>this.va1.process(r).ALP,r=>this.va2.process(r).LP,r=>this.va2.process(r).HP,r=>this.va2.process(r).BP,r=>this.va2.process(r).BS,r=>this.va2.process(r).ALP,r=>this.korg35.process(r).LP,r=>this.korg35.process(r).HP],this.setParams(1,g.frequency.init,g.resonance.init)}setParams(e,r,c){this.filterType!==e&&(this.process=this.processors[e]??this.processors[0]),this.#o(r,c)}#o(e,r){this.va1.update(e),this.va2.update(e,r),this.korg35.update(e,r)}};var K=C(g),_=class extends AudioWorkletProcessor{constructor(){super();this.processor=new k(sampleRate)}process(r,c,o){let t=o.type[0],i=o.frequency[0],u=o.resonance[0];this.processor.setParams(t,i,u);let P=r[0][0],a=c[0][0];if(!P||!a)return!0;for(let n=0;n<a.length;n++)a[n]=this.processor.process(P[n]);return!0}static get parameterDescriptors(){return K}};registerProcessor("VaFilterWorklet",_);})();`;
