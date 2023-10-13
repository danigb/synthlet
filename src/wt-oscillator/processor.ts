export const PROCESSOR = `(()=>{function k(i){return Object.keys(i).map(t=>{let{min:e,max:r,init:n}=i[t];return{name:t,minValue:e,maxValue:r,defaultValue:n,automationRate:"k-rate"}})}function d(i){let t=i,e=i.length,r=0,n=0;function u(s){let c=Math.floor(r),b=r-c,f=s>0?c+1:c-1,x=f<0?e-1:f>=e?0:f,o=t[n+c],l=t[n+x],m=o+(l-o)*b;return r+=s,r>=e&&(r-=e),r<0&&(r+=e),m}function p(s,c){n=Math.floor(s??0),e=Math.floor(Math.min(c??e,t.length)),r=r%e}function a(s){r=s%e}return{read:u,set:a,window:p}}var h=class{constructor(t){this.max=t;this.prev=0,this.val=0}set(t){this.val=t%this.max}tick(t){return t<this.prev&&(this.val=(this.val+1)%this.max),this.prev=t,this.val}};var y=class{constructor(t,e=440){this.sampleRate=t;this.inc=e/this.sampleRate,this.phase=0}freq(t){this.inc=t/this.sampleRate}tick(){let t=this.phase;return this.phase+=this.inc,this.phase>=1?this.phase-=1:this.phase<=-1&&(this.phase+=1),t}};var A={frequency:{min:0,max:2e4,init:440},morphFrequency:{min:0,max:10,init:.005}};function w(i){let t=new Float32Array(0),e=440,r=new y(i,.5),n=new h(0),u=d(t),p=d(t),a=0,s=0;function c(o){u.window(o%a*a,a),p.window((o+1)%a*a,a)}function b(o,l){a=Math.min(l,o.length),s=Math.floor(o.length/a),u=d(o),p=d(o),n=new h(s),c(n.val)}function f(o){e=o.frequency[0],s>0&&r.freq(o.morphFrequency[0])}function x(o){if(!u||!s||!a)return;let l=e/220;for(let m=0;m<o.length;m++){let P=r.tick(),v=u.read(l),g=p.read(l);o[m]=(1-P)*v+P*g;let M=n.val,W=n.tick(P);M!==W&&c(W)}return n.val}return{setWavetable:b,setParams:f,fillAudioMono:x}}var D=k(A),O=class extends AudioWorkletProcessor{constructor(){super();this.s=0,this.stop=!1,this.p=w(sampleRate),this.port.onmessage=e=>{switch(e.data.type){case"STOP":this.stop=!0;break;case"WAVE_TABLE":this.p.setWavetable(e.data.data,e.data.wavetableLength??256);break}}}process(e,r,n){return this.stop?!1:(this.p.setParams(n),this.p.fillAudioMono(r[0][0]),!0)}static get parameterDescriptors(){return D}};registerProcessor("WtOscillatorWorklet",O);})();`;
