import pandas as pd, numpy as np
d=pd.read_excel('/mnt/c/Users/valen/Downloads/linkedin_games_historico_actualizado_v54.xlsx','Historico_494')
d['Fecha']=pd.to_datetime(d.Fecha)
d['dow']=d.Fecha.dt.dayofweek
d['Juego']=d.Juego.replace({'Sudoku':'MiniSudoku'})
d['lm']=np.log(d.Mi_seg);d['la']=np.log(d.Media_seg)
d['lr']=d.lm-d.la  # log ratio (neg = faster than crowd)
print(d.Fecha.min(),d.Fecha.max(),d.Fecha.nunique(),len(d))
print(d.groupby('Juego').agg(n=('lm','size'),mi=('Mi_seg','median'),med=('Media_seg','median'),win=('Win','mean'),lr=('lr','mean')).round(3))
print('--- check win == mi<media', ((d.Mi_seg<d.Media_seg).astype(int)==d.Win).mean(), (d.Mi_seg==d.Media_seg).sum())
print('--- by dow: mine vs crowd (median log, geometric)')
g=d.groupby('dow').agg(n=('lm','size'),mi=('lm',lambda x:np.exp(x.mean())),crowd=('la',lambda x:np.exp(x.mean())),win=('Win','mean'),lr=('lr','mean'));print(g.round(3))
print('--- by dow x game: crowd time and my time (geo mean)')
print(d.pivot_table(index='Juego',columns='dow',values='la',aggfunc=lambda x:np.exp(x.mean())).round(0))
print(d.pivot_table(index='Juego',columns='dow',values='lm',aggfunc=lambda x:np.exp(x.mean())).round(0))
print(d.pivot_table(index='Juego',columns='dow',values='Win',aggfunc='mean').round(2))
# difficulty elasticity
for j,s in d.groupby('Juego'):
    b=np.polyfit(s.la,s.lm,1); r=np.corrcoef(s.la,s.lm)[0,1]
    print(j,'elasticity',b.round(2),'r',round(r,2),'sd mine',s.lm.std().round(2),'sd crowd',s.la.std().round(2))
