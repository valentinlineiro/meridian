import pandas as pd, numpy as np
exec(open('explore_1.py').read().split("print(d.Fecha.min()")[0])
d['t']=(d.Fecha-d.Fecha.min()).dt.days
d['wk']=d.t//7
# 1) Win rate vs crowd difficulty-of-day: is my result "luck of the puzzle"?
# skill residual: my log time given crowd log time, per game (regress)
res=[]
for j,s in d.groupby('Juego'):
    X=np.c_[np.ones(len(s)),s.la];b=np.linalg.lstsq(X,s.lm,rcond=None)[0]
    res.append(pd.Series(s.lm-X@b,index=s.index))
d['resid']=pd.concat(res)
# 2) trend: slope of resid per 30d, and of my log time controlling for crowd+dow
print('--- improvement: resid slope per 30 days (neg = getting faster than difficulty predicts), with CI')
for j,s in d.groupby('Juego'):
    x=s.t.values/30;y=s.resid.values
    b=np.polyfit(x,y,1);n=len(x);se=np.sqrt(((y-np.polyval(b,x))**2).sum()/(n-2)/((x-x.mean())**2).sum())
    print(f'{j:11s} n={n:3d} slope/30d={b[0]*100:+.1f}% ±{1.96*se*100:.1f}  -> '+('faster' if b[0]+1.96*se<0 else 'slower' if b[0]-1.96*se>0 else 'flat'))
# monthly resid
d['mes']=d.Fecha.dt.to_period('M')
print(d.pivot_table(index='Juego',columns='mes',values='resid',aggfunc='mean').mul(100).round(0))
# raw win rate by month vs mix
print(d.pivot_table(index='Juego',columns='mes',values='Win',aggfunc='mean').round(2))
# 3) Cross-game same-day correlation of resid ("good day")
p=d.pivot_table(index='Fecha',columns='Juego',values='resid')
print('--- same-day residual correlation');print(p.corr().round(2))
# day factor variance share
dayf=d.groupby('Fecha').resid.transform('mean')
print('share of resid variance explained by day factor', round(1-((d.resid-dayf)**2).sum()/(d.resid**2).sum(),2))
# 4) autocorrelation of day mean resid
dm=p.mean(axis=1);print('lag1 autocorr day-mean resid',round(dm.autocorr(1),2),'lag7',round(dm.autocorr(7),2))
# 5) losses: when? vs crowd time relative to median for that game/dow
L=d[d.Win==0];print('losses',len(L),'of',len(d))
print(L.groupby('Juego').size())
print('loss margin (mine/crowd) quantiles',(L.Mi_seg/L.Media_seg).describe().round(2).to_dict())
# near-misses: losses within 15%
print('losses within 15% of crowd:',((L.Mi_seg/L.Media_seg)<1.15).mean().round(2))
# 6) blow-ups: results > 2x my own expected (resid>log2?)
sd=d.groupby('Juego').resid.std()
d['z']=d.resid/d.Juego.map(sd)
print('blowups z>2:',(d.z>2).sum(),(d.z<-2).sum());print(d[d.z>2][['Fecha','Juego','Mi_seg','Media_seg','z']].tail(12).round(1).to_string())
# 7) crowd drift: is the crowd getting faster/slower (same dow)? media trend resid on dow
