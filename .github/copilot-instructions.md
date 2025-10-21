<!-- Use this file to provide workspace-specific custom instructions to Copilot. -->

# FairDealPro - Expo React Native Project Instructions

## Project Overview

This is a React Native mobile application built with Expo for team management and balancing. The app helps organize sports events and creates balanced teams based on player skill levels.

## Technology Stack

- **Framework**: Expo React Native
- **Language**: TypeScript
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Navigation**: React Navigation
- **State Management**: React Context API
- **UI Components**: React Native Elements / NativeBase

## Key Features to Implement

1. **Player Management**: Add, edit, and manage player profiles with skill ratings
2. **Team Balancing**: Algorithm to create balanced teams based on player skills
3. **Event Management**: Create and manage game events
4. **Real-time Updates**: Live updates for team changes and events
5. **Offline Support**: Basic offline functionality for core features
6. **Push Notifications**: Event reminders and updates

## Code Style Guidelines

- Use TypeScript strictly
- Follow React Native best practices
- Use functional components with hooks
- Implement proper error handling
- Use consistent naming conventions (camelCase for variables, PascalCase for components)
- Add proper commenting for complex logic

## Firebase Integration

- Use Firebase v9+ modular SDK
- Implement proper security rules
- Use real-time listeners for live updates
- Handle offline scenarios gracefully

## Performance Considerations

- Optimize FlatList usage for large data sets
- Implement proper image optimization
- Use React.memo for expensive components
- Minimize unnecessary re-renders

## Testing Strategy

- Write unit tests for utility functions
- Test Firebase integration thoroughly
- Test team balancing algorithms
- Implement end-to-end testing for critical flows

## Folder Structure

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

## Important Notes

- This project migrates from a React web application
- Preserve existing business logic and algorithms
- Focus on mobile-first user experience
- Implement native mobile patterns and interactions

```

## Important Notes

- This project migrates from a React web application
- Preserve existing business logic and algorithms
- Focus on mobile-first user experience
- Implement native mobile patterns and interactions
```
