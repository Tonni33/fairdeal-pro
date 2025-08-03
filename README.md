# FairDealPro - Professional Sports Team Management

A comprehensive React Native mobile application built with Expo for managing sports teams, creating balanced team compositions, and organizing events with a sophisticated licensing system.

## 🏆 Key Features

### Core Functionality

- **Smart Team Balancing**: Advanced algorithms create balanced teams based on player skills, positions, and preferences
- **Player Management**: Comprehensive player profiles with skill ratings, availability tracking, and photo support
- **Event Organization**: Create and manage sports events with real-time attendance tracking
- **License Management**: Professional licensing system with MasterAdmin and team admin roles

### Advanced Features

- **Biometric Authentication**: Face ID/Touch ID support for secure access
- **Real-time Synchronization**: Live updates across all devices using Firebase
- **Offline Support**: Core functionality works without internet connection
- **Role-based Access**: Different permission levels for admins and team members
- **Team Join Codes**: Easy team registration system

## 🚀 Technology Stack

- **Framework**: Expo React Native
- **Language**: TypeScript
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Navigation**: React Navigation v6
- **State Management**: React Context API
- **Icons**: Expo Vector Icons

## 📱 Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- Expo CLI (`npm install -g @expo/cli`)
- iOS Simulator (Mac) or Android Emulator

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd FairDealPro
```

2. Install dependencies:

```bash
npm install
```

3. Configure Firebase:

   - Create a new Firebase project at https://console.firebase.google.com
   - Add your app configuration to `src/services/firebase.ts`
   - Enable Firestore and Authentication in your Firebase console

4. Start the development server:

```bash
npm start
```

## 📝 Available Scripts

- `npm start` - Start the Expo development server
- `npm run android` - Run on Android emulator/device
- `npm run ios` - Run on iOS simulator/device
- `npm run web` - Run in web browser
- `npm run build` - Build the app for production

## 🏗️ Project Structure

```
src/
├── components/     # Reusable UI components
├── screens/        # Screen components
├── navigation/     # Navigation configuration
├── services/       # Firebase and API services
├── utils/          # Utility functions and algorithms
├── types/          # TypeScript type definitions
├── contexts/       # React Context providers
├── hooks/          # Custom React hooks
└── constants/      # App constants and configs
```

## 🔧 Configuration

### Firebase Setup

1. Create a Firebase project
2. Enable Firestore Database
3. Enable Authentication (Email/Password)
4. Add your configuration to `src/services/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id",
};
```

## 🎯 Team Balancing Algorithm

The app includes a sophisticated team balancing algorithm that:

- Distributes players based on skill levels
- Ensures balanced goalkeeper distribution
- Uses snake draft method for fair player distribution
- Calculates balance scores to measure team equity
- Provides suggestions for team improvements

## 🔐 Security

- Firebase Authentication for secure user management
- Firestore security rules for data protection
- User role-based access control
- Input validation and sanitization

## 📱 Platform Support

- ✅ iOS (via Expo Go or native build)
- ✅ Android (via Expo Go or native build)
- ✅ Web (limited functionality)

## 🚀 Deployment

### Development Build

```bash
expo build:android
expo build:ios
```

### Production Build

```bash
eas build --platform android
eas build --platform ios
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Firebase for backend services
- Expo for React Native development platform
- React Navigation for navigation
- The React Native community for excellent documentation

---

## 🔄 Migration from Web Version

This mobile app is a complete rewrite of the original React web application, optimized for mobile devices with:

- Native mobile interactions
- Touch-optimized UI components
- Offline-first architecture
- Push notifications (coming soon)
- App store distribution

For the web version, please see the `fairdeal-web` branch.
