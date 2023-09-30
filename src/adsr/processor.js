export const PROCESSOR = `(()=>{var i={gate:{min:0,max:1,defaultValue:0},attack:{min:0,max:10,defaultValue:.01},decay:{min:0,max:10,defaultValue:.1},sustain:{min:0,max:1,defaultValue:.5},release:{min:0,max:10,defaultValue:.3}},n=class{constructor(e){this.sampleRate=e;this.state=0,this.open=!1,this.output=0,this.attackTime=0,this.decayTime=0,this.releaseTime=0,this.attackCoef=0,this.attackTCO=Math.exp(-1.5),this.decayTCO=Math.exp(-4.95),this.releaseTCO=this.decayTCO,this.setParams(i.attack.defaultValue,i.decay.defaultValue,i.sustain.defaultValue,i.release.defaultValue)}setGate(e){let a=!!e;this.open!==a&&(this.open=a,a?this.state=1:this.state!==0&&(this.state=4))}setParams(e,a,t,s){this.setSustainLevel(t),this.setAttackTime(e),this.setDecayTime(a),this.setReleaseTime(s)}process(){switch(this.state){case 0:break;case 1:this.output=this.attackBase+this.output*this.attackCoef,(this.output>=1||this.attackTime<=0)&&(this.output=1,this.state=2);break;case 2:this.output=this.decayBase+this.output*this.decayCoef,(this.output<=this.sustainLevel||this.decayTime<=0)&&(this.output=this.sustainLevel,this.state=3);break;case 3:this.output=this.sustainLevel;break;case 4:this.output=this.releaseBase+this.output*this.releaseCoef,(this.output<=0||this.releaseTime<=0)&&(this.output=0,this.state=0)}return this.output}setSustainLevel(e){this.sustainLevel!==e&&(this.sustainLevel=e,this.decayTime=-1)}setAttackTime(e){if(this.attackTime===e)return;this.attackTime=e;let a=this.sampleRate*e,t=this.attackTCO;this.attackCoef=Math.exp(-Math.log((1+t)/t)/a),this.attackBase=(1+t)*(1-this.attackCoef)}setDecayTime(e){if(this.decayTime===e)return;this.decayTime=e;let a=this.sampleRate*e,t=this.decayTCO;this.decayCoef=Math.exp(-Math.log((1+t)/t)/a),this.decayBase=(this.sustainLevel-t)*(1-this.decayCoef)}setReleaseTime(e){if(this.releaseTime===e)return;this.releaseTime=e;let a=this.sampleRate*e,t=this.releaseTCO;this.releaseCoef=Math.exp(-Math.log((1+t)/t)/a),this.releaseBase=-t*(1-this.releaseCoef)}};var f=Object.keys(i).map(r=>{let{min:e,max:a,defaultValue:t}=i[r];return{name:r,minValue:e,maxValue:a,defaultValue:t,automationRate:"k-rate"}}),c=class extends AudioWorkletProcessor{constructor(){super();this.adsr=new n(sampleRate)}process(a,t,s){let p=s.gate[0];this.adsr.setGate(p),this.adsr.setParams(s.attack[0],s.decay[0],s.sustain[0],s.release[0]);let o=a[0],l=t[0],m=Math.min(o.length,l.length);if(m===0)return!0;let d=o[0].length;for(let u=0;u<d;u++)for(let h=0;h<m;h++)l[h][u]=o[h][u]*this.adsr.process();return!0}static get parameterDescriptors(){return f}};registerProcessor("AdsrWorklet",c);})();`;
