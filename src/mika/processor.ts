export const PROCESSOR = `(()=>{function b(t){return Object.keys(t).map(e=>{let{min:r,max:n,def:o}=t[e];return{name:e,minValue:r,maxValue:n,defaultValue:o,automationRate:"k-rate"}})}var h=Math.PI*2;function u(t,e){return t<e?(t/=e,t+t-t*t-1):t>1-e?(t=(t-1)/e,t*t+t+t+1):0}function c(t,e,r){let n=t<r?1:-1;return n+=u(t,e),n-=u((t+(1-r))%1,e),n}var k=2/4294967295;var P={wave:{min:0,max:5,def:1},frequency:{min:0,max:1e4,def:440},detune:{min:-100,max:100,def:.01}},l=class{constructor(e){this.sampleRate=e;this.osc=new d(e)}setParams(e,r,n){this.osc.setParams(e,r)}fillAudio(e){this.osc.fillAudio(e,1,!1)}},d=class{constructor(e){this.sampleRate=e;this.triLast=0;this.triCurrent=0;this.noiseValue=19.19191919191919;this.dt=1/e,this.phase=0}setParams(e,r){this.waveformType=e,this.freq=r}fillAudio(e,r,n){let o=this.phase,i=this.freq*this.dt;for(let s=0;s<e.length;s++){let a=r*this.process(o,i);e[s]=n?e[s]+a:a,o+=i,o>=1&&(o-=1)}this.phase=o}process(e,r){switch(this.waveformType){case 0:return Math.sin(this.phase*h);case 1:return this.triLast=this.triCurrent,this.triCurrent=r*c(this.phase,r,.5)+(1-r)*this.triLast,this.triCurrent*5;case 2:return 1-2*this.phase+u(this.phase,r);case 3:return c(this.phase,r,.5);case 4:return c(this.phase,r,.75);case 5:return this.noiseValue+=19,this.noiseValue*=this.noiseValue,this.noiseValue-=Math.floor(this.noiseValue),this.noiseValue-.5;default:return 0}}};var x=b(P),f=class extends AudioWorkletProcessor{constructor(){super();this.mika=new l(sampleRate)}process(r,n,o){let i=o.wave[0],s=o.frequency[0],a=o.detune[0];this.mika.setParams(i,s,a);let p=n[0];for(let m=0;m<p.length;m++)this.mika.fillAudio(p[m]);return!0}static get parameterDescriptors(){return x}};registerProcessor("MikaWorklet",f);})();`;
