'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, User, Mail, FileText, Save, Settings as SettingsIcon, Info, CheckCircle2, AlertTriangle } from 'lucide-react';

interface UserProfile {
  username: string | null;
  isUsernameSet: boolean;
  email: string | null;
  profilePictureUrl: string | null;
  bio: string | null;
}

export default function SettingsPage() {
  const { user, isLoading, fetchUser } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usernameValidation, setUsernameValidation] = useState<{
    isValid: boolean | null;
    message: string;
    isChecking: boolean;
  }>({ isValid: null, message: '', isChecking: false });
  const hasFetchedRef = useRef(false);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    username: '',
    isUsernameSet: false,
    email: '',
    profilePictureUrl: '',
    bio: '',
  });

  const fetchProfile = useCallback(async () => {
    if (!user?.walletAddress || hasFetchedRef.current) return;
    
    hasFetchedRef.current = true;
    try {
      const response = await fetch(`/api/user/profile?walletAddress=${encodeURIComponent(user.walletAddress)}`);
      if (response.ok) {
        const data = await response.json();
        setProfile({
          username: data.username || '',
          isUsernameSet: data.isUsernameSet || false,
          email: data.email || '',
          profilePictureUrl: data.profilePictureUrl || '',
          bio: data.bio || '',
        });
      } else {
        toast({
          title: "Error",
          description: "No se pudieron cargar los datos del perfil.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos del perfil.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user?.walletAddress, toast]);

  const validateUsername = useCallback(async (username: string) => {
    if (profile.isUsernameSet) {
      setUsernameValidation({
        isValid: null,
        message: '',
        isChecking: false
      });
      return;
    }

    if (!username) {
      setUsernameValidation({
        isValid: null,
        message: '',
        isChecking: false
      });
      return;
    }

    if (username.length < 3) {
      setUsernameValidation({
        isValid: false,
        message: 'Usa al menos 3 caracteres.',
        isChecking: false
      });
      return;
    }

    // Start checking with database
    setUsernameValidation({
      isValid: null,
      message: 'Comprobando disponibilidad…',
      isChecking: true
    });

    try {
      const response = await fetch('/api/user/validate-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: user?.walletAddress,
          username: username
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUsernameValidation({
          isValid: data.valid,
          message: data.valid ? data.message : data.error,
          isChecking: false
        });
      } else {
        setUsernameValidation({
          isValid: false,
          message: data.error || 'No se pudo comprobar la disponibilidad.',
          isChecking: false
        });
      }
    } catch (error) {
      setUsernameValidation({
        isValid: false,
        message: 'No se pudo comprobar la disponibilidad.',
        isChecking: false
      });
    }
  }, [profile.isUsernameSet, user?.walletAddress]);

  useEffect(() => {
    if (!isLoading && user) {
      fetchProfile();
    } else if (!isLoading && !user) {
      setLoading(false);
    }
  }, [isLoading, user, fetchProfile]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: user?.walletAddress,
          username: profile.username || undefined,
          email: profile.email || undefined,
          bio: profile.bio || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setProfile({
          username: data.username || '',
          isUsernameSet: data.isUsernameSet || false,
          email: data.email || '',
          profilePictureUrl: data.profilePictureUrl || '',
          bio: data.bio || '',
        });
        toast({
          title: "Perfil actualizado",
          description: "Tus ajustes se han guardado correctamente.",
        });
        
        // Refresh user data in AuthProvider to update header
        if (fetchUser) {
          fetchUser();
        }
      } else {
        toast({
          title: "Error",
          description: data.error || "No se pudo actualizar el perfil.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el perfil.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "El archivo debe ocupar menos de 5 MB.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;

      try {
        const response = await fetch('/api/user/avatar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: user?.walletAddress,
            avatar: base64String,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          setProfile(prev => ({
            ...prev,
            profilePictureUrl: data.profilePictureUrl || base64String,
          }));
          toast({
            title: "Avatar actualizado",
            description: "Tu foto de perfil se ha actualizado correctamente.",
          });
          
          // Refresh user data in AuthProvider to update header
          if (fetchUser) {
            fetchUser();
          }
        } else {
          toast({
            title: "Error",
            description: data.error || "No se pudo subir el avatar.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error uploading avatar:', error);
        toast({
          title: "Error",
          description: "No se pudo subir el avatar.",
          variant: "destructive",
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (field: keyof UserProfile) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const newValue = e.target.value;
    setProfile(prev => ({
      ...prev,
      [field]: newValue
    }));

    // Real-time validation for username
    if (field === 'username') {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
      validationTimeoutRef.current = setTimeout(() => {
        validateUsername(newValue);
      }, 300); // Debounce validation
    }
  };

  if (loading || isLoading) {
    return (
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  // Show locked state if user is not authenticated
  if (!user) {
    return (
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold font-headline bg-gradient-to-r from-lilac-300 to-lilac-400 bg-clip-text text-transparent mb-4">
              Ajustes de perfil
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Gestiona tu identidad pública, tu alias y tus preferencias.
            </p>
          </div>
          <Card className="relative overflow-hidden border border-pink-600/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
            <CardContent className="p-8 text-center">
              <div className="text-6xl mb-4">🔒</div>
              <h2 className="text-2xl font-bold font-headline mb-4">Conecta tu wallet</h2>
              <p className="text-muted-foreground">Conecta tu wallet para acceder a los ajustes y personalizar tu perfil.</p>
            </CardContent>
          </Card>
        </div>
    );
  }

  const displayAvatar = profile.profilePictureUrl || undefined;
  const avatarFallback = profile.username ? profile.username.slice(0, 2).toUpperCase() : 'CW';

  return (
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold font-headline bg-gradient-to-r from-lilac-300 to-lilac-400 bg-clip-text text-transparent mb-4">
            Ajustes de perfil
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Gestiona tu identidad pública, tu alias y tus preferencias.
          </p>
        </div>

        {/* Settings Tabs */}
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-gradient-to-r from-pink-600/10 to-pink-600/10 border border-pink-600/20 rounded-2xl p-1">
            <TabsTrigger 
              value="profile" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-lilac-400 data-[state=active]:to-lilac-500 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
            >
              <User className="h-4 w-4 mr-2" />
              Perfil público
            </TabsTrigger>
            <TabsTrigger 
              value="preferences" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-lilac-400 data-[state=active]:to-lilac-500 data-[state=active]:text-white font-semibold rounded-xl transition-all duration-300"
            >
              <SettingsIcon className="h-4 w-4 mr-2" />
              Preferencias
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <form onSubmit={handleSubmit}>
              <Card className="relative overflow-hidden border border-pink-600/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-lilac-300" />
                    Perfil público
                  </CardTitle>
                  <CardDescription>
                    Estos datos serán visibles para otros jugadores. El alias de Treasure Hunt se configura en Mi cuenta.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar Section */}
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative group">
                      <Avatar className="h-24 w-24 border-4 border-primary shadow-lg shadow-primary/20 transition-all duration-300 group-hover:scale-105">
                        <AvatarImage src={displayAvatar} alt={profile.username || 'Avatar de cuenta'} />
                        <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-pink-500 to-pink-600">
                          {avatarFallback}
                        </AvatarFallback>
                      </Avatar>
                      <label 
                        htmlFor="avatar-upload" 
                        className="absolute bottom-0 right-0 bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white p-2 rounded-full shadow-lg shadow-pink-600/20 cursor-pointer transition-all duration-300 hover:scale-110 hover:shadow-xl"
                      >
                        <Camera className="h-4 w-4" />
                        <span className="sr-only">Cambiar foto</span>
                      </label>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarChange}
                      />
                    </div>
                    
                    <div className="flex-1 space-y-4 w-full">
                      <div className="space-y-2">
                        <Label htmlFor="username" className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Nombre de perfil
                          {profile.isUsernameSet && (
                            <div className="flex items-center gap-1 ml-auto">
                          <Info className="h-4 w-4 text-amber-300" />
                          <span className="text-xs text-amber-300">No se puede modificar</span>
                            </div>
                          )}
                        </Label>
                        <Input 
                          id="username" 
                          value={profile.username || ''} 
                          onChange={handleInputChange('username')}
                          placeholder="Elige tu nombre de perfil"
                          disabled={profile.isUsernameSet}
                          className={`border-pink-600/20 focus:border-pink-500 bg-card/50 backdrop-blur-sm ${
                            profile.isUsernameSet ? 'opacity-60 cursor-not-allowed' : ''
                          }`}
                        />
                        {!profile.isUsernameSet && (
                          <p className="text-xs text-yellow-500 flex items-center gap-1">
                            <Info className="h-3 w-3" />
                            Solo puede elegirse una vez: identifica tu perfil y tus enlaces de referido.
                            El nombre del ranking de Treasure Hunt se configura aparte en las reglas de la competición.
                          </p>
                        )}
                        {usernameValidation.message && (
                          <p className={`text-xs flex items-center gap-1 ${
                            usernameValidation.isValid 
                              ? 'text-pink-600' 
                              : usernameValidation.isValid === false 
                                ? 'text-red-500' 
                                : 'text-muted-foreground'
                          }`}>
                            {usernameValidation.isChecking ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : usernameValidation.isValid ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : usernameValidation.isValid === false ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : null}
                            {usernameValidation.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email" className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Email
                        </Label>
                        <Input 
                          id="email" 
                          type="email"
                          value={profile.email || ''} 
                          onChange={handleInputChange('email')}
                          placeholder="Tu email (opcional)"
                          className="border-pink-600/20 focus:border-pink-500 bg-card/50 backdrop-blur-sm"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="bio" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Biografía
                    </Label>
                    <Textarea
                      id="bio"
                      placeholder="Cuéntanos algo sobre ti..."
                      value={profile.bio || ''}
                      onChange={handleInputChange('bio')}
                      rows={3}
                      className="border-pink-600/20 focus:border-pink-500 bg-card/50 backdrop-blur-sm resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Máximo 200 caracteres. Será visible en tu perfil público.
                    </p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button 
                      type="submit" 
                      disabled={saving}
                      className="bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-pink-600/20 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-pink-600/30"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Guardando…
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Guardar cambios
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
          </TabsContent>

          <TabsContent value="preferences" className="mt-6">
            <Card className="relative overflow-hidden border border-pink-600/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-primary/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5 text-blue-400" />
                  Preferencias
                </CardTitle>
                <CardDescription>
                  Personaliza tu experiencia y consulta las preferencias disponibles.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🚧</div>
                  <h3 className="text-xl font-bold font-headline mb-2">En preparación</h3>
                  <p className="text-muted-foreground">
                    Las preferencias avanzadas y las notificaciones estarán disponibles más adelante.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Wallet Info Card */}
        <Card className="relative overflow-hidden border border-blue-500/20 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-lg shadow-blue-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-400">
              🔗 Wallet conectada
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-mono text-sm text-muted-foreground break-all">
                  {user.walletAddress}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esta dirección se usa para autenticarte y asociar tus recompensas.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  );
}
